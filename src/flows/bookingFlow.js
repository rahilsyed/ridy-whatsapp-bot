// src/flows/bookingFlow.js

const { getSession, setSession, deleteSession } = require("../store/sessionStore");
const authService = require("../services/authService");
const metaService = require("../services/metaService");
const placesService = require("../services/placesService");
const axios = require("axios");
const { v4: uuid } = require("uuid");

const BASE_URL = process.env.BASE_URL;

// ---- Helpers ---- //

const SERVICE_ID = "ihJseWkM1HVyLQ_ySVuxf";

async function getVehicleTypes(token, customerId, coordinates) {
  const [longitude, latitude] = coordinates;
  const url = `${BASE_URL}/services/${SERVICE_ID}/vehicles`;
  console.log("[getVehicleTypes] GET", url);

  const res = await axios.get(url, {
    params: { customerId, latitude, longitude },
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "en",
    },
  });

  console.log("[getVehicleTypes] status:", res.status);
  console.log("[getVehicleTypes] response:", JSON.stringify(res.data, null, 2));

  return res.data.data;
}

async function createOrder(session) {
  const payload = {
    pickup: session.pickup,
    dropoffs: [session.drop],
    service: session.booking.service,
    vehicleType: session.booking.vehicleType,
    customerId: session.auth.customerId,
    promoCode: "",
    isScheduled: false,
  };

  console.log("[createOrder] payload:", JSON.stringify(payload, null, 2));

  const res = await axios.post(`${BASE_URL}/orders`, payload, {
    headers: {
      Authorization: `Bearer ${session.auth.token}`,
      "Idempotency-key": uuid(),
      "Accept-Language": "en",
      "Content-Type": "application/json",
    },
  });

  console.log("[createOrder] response:", JSON.stringify(res.data, null, 2));
  return res;
}

function isLocationMessage(msg) {
  return msg?.type === "location";
}

function extractLocation(msg) {
  return {
    address: "Shared Location",
    coordinates: [msg.location.longitude, msg.location.latitude],
    schedulePickupNow: false,
    scheduleDateAfter: 0,
    scheduleDateBefore: 0,
  };
}

// ---- Main Flow ---- //

exports.handleMessage = async (phone, msg) => {
    console.log("msg is here ",msg);
    
  let session = await getSession(phone);

  if (!session) {
    session = { step: "START" };
  }

  // Already authenticated — skip login/OTP, go straight to pickup
  if (session.step === "START" && session.auth?.token) {
    session.step = "ASK_PICKUP";
    await setSession(phone, session);
    await metaService.sendMessage(
      phone,
      "📍 Let's start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp's location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan"
    );
    return;
  }

  // Global "menu" command — restart booking from pickup (preserves auth)
  const msgText = msg?.text?.body?.trim().toLowerCase();
  if (
    msgText === "menu" &&
    session.auth?.token &&
    session.step !== "START" &&
    session.step !== "ASK_OTP"
  ) {
    session = { step: "ASK_PICKUP", auth: session.auth };
    await setSession(phone, session);
    await metaService.sendMessage(
      phone,
      "📍 Let's book a ride! \n Let's start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp's location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan\n\nExample: Office 45, Nile Street, Khartoum, Sudan"
    );
    return;
  }

  // Global "back" command — redo the location/vehicle just picked, without
  // restarting the whole booking. Without this, once the flow has moved on
  // to the next step there is no way to correct a wrong pickup/drop — a
  // location shared afterwards just gets captured as the *next* field
  // instead, while the wrong one stays locked in for the order.
  if (
    msgText === "back" &&
    session.auth?.token &&
    ["ASK_DROP", "SELECT_DROP", "ASK_VEHICLE", "CONFIRM"].includes(session.step)
  ) {
    if (session.step === "ASK_DROP" || session.step === "SELECT_DROP") {
      session = { step: "ASK_PICKUP", auth: session.auth };
      await setSession(phone, session);
      await metaService.sendMessage(
        phone,
        "🔄 Okay, let's redo your pickup.\n\n📍 Type your address or share 📌 *live location*.\n\nExample: Office 45, Nile Street, Khartoum, Sudan"
      );
      return;
    }

    if (session.step === "ASK_VEHICLE") {
      session.step = "ASK_DROP";
      session.vehicleTypes = null;
      session.drop = null;
      await setSession(phone, session);
      await metaService.sendMessage(
        phone,
        "🔄 Okay, let's redo your destination.\n\n📍 Type your address or share 📌 *live location*.\n\nExample: Al Gomhuriya Street, Khartoum, Sudan"
      );
      return;
    }

    if (session.step === "CONFIRM") {
      session.step = "ASK_VEHICLE";
      await setSession(phone, session);
      await metaService.sendVehicleList(phone, session.vehicleTypes);
      return;
    }
  }

  try {
    switch (session.step) {
      // ---------------- START ---------------- //
      case "START":
        await authService.login(phone);

        session.step = "ASK_OTP";

        await metaService.sendMessage(
          phone,
          "*Welcome TO Ride App*\nEnter OTP to continue:"
        );
        break;

      // ---------------- OTP ---------------- //
      case "ASK_OTP":
        if (!msg?.text?.body) {
          await metaService.sendMessage(phone, "Please enter the OTP sent to your number:");
          return;
        }
        const auth = await authService.verify(phone, msg.text.body);

        session.auth = auth;

        session.step = "ASK_PICKUP";

        await metaService.sendMessage(
          phone,
          "📍 Let’s start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp’s location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan"
        );
        break;

      // ---------------- PICKUP ---------------- //
      case "ASK_PICKUP":
        if (isLocationMessage(msg)) {
          const { latitude, longitude } = msg.location;
          await metaService.sendMessage(phone, "🔍 Locating your address...");
          const geocoded = await placesService.reverseGeocode(latitude, longitude);
          session.pickup = geocoded
            ? { address: geocoded.address, coordinates: geocoded.coordinates, schedulePickupNow: false, scheduleDateAfter: 0, scheduleDateBefore: 0 }
            : extractLocation(msg);
          session.step = "ASK_DROP";
          await metaService.sendMessage(
            phone,
            `✅ Pickup set to:\n${session.pickup.address}\n\nNow enter your destination or share 📌 location.\n(Wrong pickup? Type *back* to redo it.)\n\nExample: Al Gomhuriya Street, Khartoum, Sudan`
          );
        } else {
          const pickupResults = await placesService.searchPlaces(msg.text.body);
          if (!pickupResults.length) {
            await metaService.sendMessage(
              phone,
              "❌ No locations found. Please try a different address."
            );
            return;
          }
          session.pickupResults = pickupResults;
          session.step = "SELECT_PICKUP";
          await metaService.sendPlacesList(phone, pickupResults, "📍 Choose Pickup");
        }
        break;

      // ---------------- SELECT PICKUP ---------------- //
      case "SELECT_PICKUP": {
        const pickupId = msg?.interactive?.list_reply?.id;

        if (pickupId === "place_none") {
          session.step = "ASK_PICKUP";
          await metaService.sendMessage(
            phone,
            "📍 Please enter your pickup address again:"
          );
          break;
        }

        const pickupIdx = parseInt(pickupId?.split("_")[1]);
        const pickupPlace = session.pickupResults?.[pickupIdx];

        if (!pickupPlace || isNaN(pickupIdx)) {
          await metaService.sendPlacesList(phone, session.pickupResults, "📍 Choose Pickup");
          break;
        }

        session.pickup = {
          address: pickupPlace.address,
          coordinates: pickupPlace.coordinates,
          schedulePickupNow: false,
          scheduleDateAfter: 0,
          scheduleDateBefore: 0,
        };
        session.pickupResults = null;
        session.step = "ASK_DROP";

        await metaService.sendMessage(
          phone,
          "Where would you like to go? 📍 Enter your destination.\n(Wrong pickup? Type *back* to redo it.)\n\nExample: Al Gomhuriya Street, Khartoum, Sudan"
        );
        break;
      }

      // ---------------- DROP ---------------- //
      case "ASK_DROP":
        if (isLocationMessage(msg)) {
          const { latitude: dropLat, longitude: dropLng } = msg.location;
          await metaService.sendMessage(phone, "🔍 Locating your destination...");
          const dropGeocoded = await placesService.reverseGeocode(dropLat, dropLng);
          session.drop = dropGeocoded
            ? { address: dropGeocoded.address, coordinates: dropGeocoded.coordinates, scheduleDateAfter: 0, scheduleDateBefore: 0 }
            : extractLocation(msg);
          // fetch vehicle types
          const vehiclesDirect = await getVehicleTypes(
            session.auth.token,
            session.auth.customerId,
            session.pickup.coordinates
          );
          session.vehicleTypes = vehiclesDirect.map((v) => ({
            id: v.id,
            title: v.title,
            description: v.description || "",
          }));
          session.step = "ASK_VEHICLE";
          await metaService.sendVehicleList(phone, session.vehicleTypes);
        } else {
          const dropResults = await placesService.searchPlaces(msg.text.body);
          if (!dropResults.length) {
            await metaService.sendMessage(
              phone,
              "❌ No locations found. Please try a different address."
            );
            return;
          }
          session.dropResults = dropResults;
          session.step = "SELECT_DROP";
          await metaService.sendPlacesList(phone, dropResults, "📍 Choose Dropoff");
        }
        break;

      // ---------------- SELECT DROP ---------------- //
      case "SELECT_DROP": {
        const dropId = msg?.interactive?.list_reply?.id;

        if (dropId === "place_none") {
          session.step = "ASK_DROP";
          await metaService.sendMessage(
            phone,
            "📍 Please enter your destination address again:"
          );
          break;
        }

        const dropIdx = parseInt(dropId?.split("_")[1]);
        const dropPlace = session.dropResults?.[dropIdx];

        if (!dropPlace || isNaN(dropIdx)) {
          await metaService.sendPlacesList(phone, session.dropResults, "📍 Choose Dropoff");
          break;
        }

        session.drop = {
          address: dropPlace.address,
          coordinates: dropPlace.coordinates,
          scheduleDateAfter: 0,
          scheduleDateBefore: 0,
        };
        session.dropResults = null;

        const vehicles = await getVehicleTypes(
          session.auth.token,
          session.auth.customerId,
          session.pickup.coordinates
        );
        session.vehicleTypes = vehicles.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description || "",
        }));
        session.step = "ASK_VEHICLE";
        await metaService.sendVehicleList(phone, session.vehicleTypes);
        break;
      }

      // ---------------- VEHICLE ---------------- //
      case "ASK_VEHICLE":
        const selectedId = msg?.interactive?.list_reply?.id;
        const selected = session.vehicleTypes.find((v) => v.id === selectedId);

        if (!selected) {
          await metaService.sendVehicleList(phone, session.vehicleTypes);
          return;
        }

        session.booking = {
          service: {
            id: SERVICE_ID,
            options: [],
          },
          vehicleType: {
            id: selected.id,
            options: [],
          },
        };
        session.selectedVehicleTitle = selected.title;

        session.step = "CONFIRM";

        await metaService.sendConfirmButtons(
          phone,
          session.pickup.address,
          session.drop.address,
          selected.title
        );
        break;

      // ---------------- CONFIRM ---------------- //
      case "CONFIRM":
        const reply = msg?.interactive?.button_reply?.id;

        if (!reply) {
          // User sent a text instead of tapping a button — re-send the buttons
          await metaService.sendConfirmButtons(
            phone,
            session.pickup.address,
            session.drop.address,
            session.selectedVehicleTitle
          );
          return;
        }

        if (reply === "confirm_no") {
          await metaService.sendMessage(phone, "❌ Booking cancelled.");
          session = { step: "ASK_PICKUP", auth: session.auth };
          await metaService.sendMessage(
            phone,
            "📍 Let's start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp's location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan"
          );
          break;
        }

        await metaService.sendMessage(phone, "⏳ Booking your ride...");

        const orderRes = await createOrder(session);
        const orderId = orderRes.data?.data?.orderId || orderRes.data?.data?.id;
        const trackUrl = orderRes.data?.data?.trackOrder;

        let successMsg = "✅ Ride booked successfully!";
        if (orderId) successMsg += `\n\n🆔 Order: ${orderId}`;
        if (trackUrl) successMsg += `\n🔗 Track: ${trackUrl}`;

        await metaService.sendMessage(phone, successMsg);

        // Keep auth, reset to pickup for next ride
        session = { step: "ASK_PICKUP", auth: session.auth };

        await metaService.sendMessage(
          phone,
          "📍 Need another ride? Enter your pickup location or type *menu* to restart."
        );
        break;
    }

    if (session) {
      await setSession(phone, session);
    } else {
      await deleteSession(phone);
    }
  } catch (err) {
    const status = err?.response?.status;
    console.error("Flow Error:", err?.response?.data || err.message);

    if (status === 401) {
      // Token expired — restart auth
      await authService.login(phone);
      await deleteSession(phone);
      await metaService.sendMessage(
        phone,
        "🔐 Your session expired. A new OTP has been sent — please enter it:"
      );
      await setSession(phone, { step: "ASK_OTP" });
    } else {
      await metaService.sendMessage(
        phone,
        "⚠️ Something went wrong. Please try again."
      );
      // Reset to pickup but keep auth so user doesn't need to re-verify OTP
      const savedAuth = session?.auth;
      if (savedAuth) {
        await setSession(phone, { step: "ASK_PICKUP", auth: savedAuth });
      } else {
        await deleteSession(phone);
      }
    }
  }
};