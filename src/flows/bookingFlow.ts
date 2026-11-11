import 'dotenv/config'
import axios from "axios";
import { randomUUID as uuid } from "crypto";
import { deleteSession, getSession, setSession } from "../store/sessionStore";
import {
  sendBookingConfirmation,
  sendButtons,
  sendConfirmButtons,
  sendLinkButton,
  sendMessage,
  sendPlacesList,
  sendVehicleList,
} from "../services/metaService";
import { login, verify } from "../services/authService";
import { ensureRegistered } from "../services/profileService";
import { reverseGeocode, searchPlaces } from "../services/placesService";

const BASE_URL = process.env.BASE_URL;

// ---- Helpers ---- //

const SERVICE_ID = "ihJseWkM1HVyLQ_ySVuxf";

// TEMPORARY: static vehicle list until the new vehicles API is available.
// Each id must be unique — ASK_VEHICLE looks up the customer's choice by id.
const STATIC_VEHICLES = [
  { id: "economy", title: "Sedan", description: "Comfortable and cheap" },
  { id: "comfort", title: "SUV", description: "Extra space for up to 6 people" },
  { id: "premium", title: "Luxury", description: "Premium car for a top-class ride" },
];

async function getVehicleTypes(token: any, customerId: any, coordinates: any) {
  console.log("[getVehicleTypes] using STATIC_VEHICLES (API disabled)");
  return STATIC_VEHICLES;

  // TODO: restore when the new vehicles endpoint is ready (path/response may change).
  // const [longitude, latitude] = coordinates;
  // const url = `${BASE_URL}/services/${SERVICE_ID}/vehicles`;
  // console.log("[getVehicleTypes] GET", url);
  //
  // const res = await axios.get(url, {
  //   params: { customerId, latitude, longitude },
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     "Accept-Language": "en",
  //   },
  // });
  //
  // console.log("[getVehicleTypes] status:", res.status);
  // console.log("[getVehicleTypes] response:", JSON.stringify(res.data, null, 2));
  //
  // return res.data.data;
}

// TEMPORARY: fixed order options (from the Postman example) until the flow
// asks the customer for them / the backend quotes a price.
const ORDER_DEFAULTS = {
  trip_options: ["ac", "child_seat"],
  payment_method: "wallet",
};
const PROPOSED_PRICE_MINOR = 5500;

// Labels shown to the customer for API values.
const TRIP_OPTION_LABELS: Record<string, string> = { ac: "AC", child_seat: "Child seat" };
const PAYMENT_LABELS: Record<string, string> = { wallet: "Wallet", cash: "Cash", card: "Card" };

// "in_progress" -> "In progress"
const humanize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ").toLowerCase();

const PICKUP_PROMPT =
  "📍 Let's start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp's location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan";

// Session locations store coordinates as [longitude, latitude].
const toOrderLocation = (loc: any) => ({
  address: loc.address,
  lat: loc.coordinates[1],
  lon: loc.coordinates[0],
});

async function createOrder(session: any, phone: string) {
  // Normally set at login; retry here if registration failed then.
  if (!session.auth.serviceProfileId) {
    session.auth.serviceProfileId = await ensureRegistered(
      session.auth.token,
      session.auth.customerId,
      phone,
    );
  }

  const payload = {
    service_profile_id: session.auth.serviceProfileId,
    customer_id: session.auth.customerId,
    order_details: {
      pickup: toOrderLocation(session.pickup),
      dropoffs: [toOrderLocation(session.drop)],
      vehicle_type: { id: session.booking.vehicleType.id },
      ...ORDER_DEFAULTS,
    },
    proposed_price_minor: PROPOSED_PRICE_MINOR,
  };

  console.log("[createOrder] payload123:", JSON.stringify(payload, null, 2));

  const res = await axios.post(`${BASE_URL}/order/v1/orders`, payload, {
    headers: {
      Authorization: `Bearer ${session.auth.token}`,
      "Idempotency-Key": uuid(),
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  console.log("[createOrder] response:", JSON.stringify(res.data, null, 2));
  return res;
}

async function getOrder(token: string, orderId: string) {
  const res = await axios.get(`${BASE_URL}/order/v1/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return res.data;
}

// The API rejects a cancel whose `version` is stale (e.g. a driver accepted
// in the meantime), so read the order's current version right before cancelling.
async function cancelOrder(token: string, orderId: string) {
  const current = await getOrder(token, orderId);
  if (current.state === "cancelled") return current;

  const res = await axios.post(
    `${BASE_URL}/order/v1/orders/${orderId}/cancel`,
    {
      version: current.version,
      reason: "changed_mind",
      note: "Cancelled by customer via WhatsApp",
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": uuid(),
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );
  console.log("[cancelOrder] response:", JSON.stringify(res.data, null, 2));
  return res.data;
}

// Amounts are in minor units: 8250 + "SDG" -> "SDG 82.50".
const formatMoney = (minor: number, currency?: string) =>
  `${currency ? `${currency} ` : ""}${(minor / 100).toFixed(2)}`;

const BOOK_AGAIN_BUTTONS = [
  { id: "post_new_ride", title: "🚕 Book another" },
  { id: "post_done", title: "👍 All done" },
];

function isLocationMessage(msg: any) {
  return msg?.type === "location";
}

function extractLocation(msg: any) {
  return {
    address: "Shared Location",
    coordinates: [msg.location.longitude, msg.location.latitude],
    schedulePickupNow: false,
    scheduleDateAfter: 0,
    scheduleDateBefore: 0,
  };
}

// ---- Main Flow ---- //

export const handleMessage = async (phone: any, msg: any): Promise<void> => {
  console.log("msg is here ", msg);

  let session = await getSession(phone);

  if (!session) {
    session = { step: "START" };
  }

  // Already authenticated — skip login/OTP, go straight to pickup
  if (session.step === "START" && session.auth?.token) {
    session.step = "ASK_PICKUP";
    await setSession(phone, session);
    await sendMessage(
      phone,
      "📍 Let's start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp's location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan",
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
    await sendMessage(
      phone,
      "📍 Let's book a ride! \n Let's start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp's location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan\n\nExample: Office 45, Nile Street, Khartoum, Sudan",
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
      await sendMessage(
        phone,
        "🔄 Okay, let's redo your pickup.\n\n📍 Type your address or share 📌 *live location*.\n\nExample: Office 45, Nile Street, Khartoum, Sudan",
      );
      return;
    }

    if (session.step === "ASK_VEHICLE") {
      session.step = "ASK_DROP";
      session.vehicleTypes = null;
      session.drop = null;
      await setSession(phone, session);
      await sendMessage(
        phone,
        "🔄 Okay, let's redo your destination.\n\n📍 Type your address or share 📌 *live location*.\n\nExample: Al Gomhuriya Street, Khartoum, Sudan",
      );
      return;
    }

    if (session.step === "CONFIRM") {
      session.step = "ASK_VEHICLE";
      await setSession(phone, session);
      await sendVehicleList(phone, session.vehicleTypes);
      return;
    }
  }

  try {
    switch (session.step) {
      // ---------------- START ---------------- //
      case "START":
        session.loginHandle = (await login(phone)).loginHandle;

        session.step = "ASK_OTP";

        await sendMessage(
          phone,
          "*Welcome TO Ride App*\nEnter OTP to continue:",
        );
        break;

      // ---------------- OTP ---------------- //
      case "ASK_OTP":
        if (!msg?.text?.body) {
          await sendMessage(phone, "Please enter the OTP sent to your number:");
          return;
        }
        if (
          !session.loginHandle ||
          msg.text.body.trim().toLowerCase() === "resend"
        ) {
          session.loginHandle = (await login(phone)).loginHandle;
          await sendMessage(phone, "📩 A new OTP has been sent. Please enter it:");
          break;
        }

        let auth;
        try {
          auth = await verify(session.loginHandle, msg.text.body);
        } catch (verifyErr: any) {
          const verifyStatus = verifyErr?.response?.status;
          if (verifyStatus >= 400 && verifyStatus < 500) {
            console.error("[verify] rejected:", verifyErr.response.data);
            await sendMessage(
              phone,
              "❌ That code is invalid or expired. Please try again, or reply *resend* for a new code.",
            );
            return;
          }
          throw verifyErr;
        }

        session.auth = auth;
        delete session.loginHandle;

        // Customer must be registered with the service profile before ordering.
        session.auth.serviceProfileId = await ensureRegistered(
          auth.token,
          auth.customerId,
          phone,
        );

        session.step = "ASK_PICKUP";

        await sendMessage(
          phone,
          "📍 Let’s start with your pickup.\n\nYou can:\n• Type your address\n• Or share your 📌 *live location* using WhatsApp’s location feature\n\nExample: Office 45, Nile Street, Khartoum, Sudan",
        );
        break;

      // ---------------- PICKUP ---------------- //
      case "ASK_PICKUP":
        if (isLocationMessage(msg)) {
          const { latitude, longitude } = msg.location;
          await sendMessage(phone, "🔍 Locating your address...");
          const geocoded = await reverseGeocode(latitude, longitude);
          session.pickup = geocoded
            ? {
                address: geocoded.address,
                coordinates: geocoded.coordinates,
                schedulePickupNow: false,
                scheduleDateAfter: 0,
                scheduleDateBefore: 0,
              }
            : extractLocation(msg);
          session.step = "ASK_DROP";
          await sendMessage(
            phone,
            `✅ Pickup set to:\n${session.pickup.address}\n\nNow enter your destination or share 📌 location.\n(Wrong pickup? Type *back* to redo it.)\n\nExample: Al Gomhuriya Street, Khartoum, Sudan`,
          );
        } else {
          const pickupResults = await searchPlaces(msg.text.body);
          if (!pickupResults.length) {
            await sendMessage(
              phone,
              "❌ No locations found. Please try a different address.",
            );
            return;
          }
          session.pickupResults = pickupResults;
          session.step = "SELECT_PICKUP";
          await sendPlacesList(phone, pickupResults, "📍 Choose Pickup");
        }
        break;

      // ---------------- SELECT PICKUP ---------------- //
      case "SELECT_PICKUP": {
        // User shared a live/pinned location instead of picking from the list —
        // honor it directly rather than re-showing stale search results.
        if (isLocationMessage(msg)) {
          const { latitude, longitude } = msg.location;
          await sendMessage(phone, "🔍 Locating your address...");
          const geocoded = await reverseGeocode(latitude, longitude);
          session.pickup = geocoded
            ? {
                address: geocoded.address,
                coordinates: geocoded.coordinates,
                schedulePickupNow: false,
                scheduleDateAfter: 0,
                scheduleDateBefore: 0,
              }
            : extractLocation(msg);
          session.pickupResults = null;
          session.step = "ASK_DROP";
          await sendMessage(
            phone,
            `✅ Pickup set to:\n${session.pickup.address}\n\nNow enter your destination or share 📌 location.\n(Wrong pickup? Type *back* to redo it.)\n\nExample: Al Gomhuriya Street, Khartoum, Sudan`,
          );
          break;
        }

        const pickupId = msg?.interactive?.list_reply?.id;

        if (pickupId === "place_none") {
          session.step = "ASK_PICKUP";
          await sendMessage(
            phone,
            "📍 Please enter your pickup address again:",
          );
          break;
        }

        // No valid list selection — if the user typed free text instead of
        // tapping the list (e.g. they didn't want any of the options and
        // typed a different address), treat it as a brand-new search rather
        // than silently re-showing the previous, now-irrelevant results.
        if (!pickupId && msg?.text?.body) {
          const newPickupResults = await searchPlaces(msg.text.body);
          if (!newPickupResults.length) {
            await sendMessage(
              phone,
              "❌ No locations found. Please try a different address.",
            );
            return;
          }
          session.pickupResults = newPickupResults;
          await sendPlacesList(phone, newPickupResults, "📍 Choose Pickup");
          break;
        }

        const pickupIdx = parseInt(pickupId?.split("_")[1]);
        const pickupPlace = session.pickupResults?.[pickupIdx];

        if (!pickupPlace || isNaN(pickupIdx)) {
          await sendPlacesList(
            phone,
            session.pickupResults,
            "📍 Choose Pickup",
          );
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

        await sendMessage(
          phone,
          "Where would you like to go? 📍 Enter your destination.\n(Wrong pickup? Type *back* to redo it.)\n\nExample: Al Gomhuriya Street, Khartoum, Sudan",
        );
        break;
      }

      // ---------------- DROP ---------------- //
      case "ASK_DROP":
        if (isLocationMessage(msg)) {
          const { latitude: dropLat, longitude: dropLng } = msg.location;
          await sendMessage(phone, "🔍 Locating your destination...");
          const dropGeocoded = await reverseGeocode(dropLat, dropLng);
          session.drop = dropGeocoded
            ? {
                address: dropGeocoded.address,
                coordinates: dropGeocoded.coordinates,
                scheduleDateAfter: 0,
                scheduleDateBefore: 0,
              }
            : extractLocation(msg);
          // fetch vehicle types
          const vehiclesDirect = await getVehicleTypes(
            session.auth.token,
            session.auth.customerId,
            session.pickup.coordinates,
          );
          session.vehicleTypes = vehiclesDirect.map((v: any) => ({
            id: v.id,
            title: v.title,
            description: v.description || "",
          }));
          session.step = "ASK_VEHICLE";
          await sendVehicleList(phone, session.vehicleTypes);
        } else {
          const dropResults = await searchPlaces(msg.text.body);
          if (!dropResults.length) {
            await sendMessage(
              phone,
              "❌ No locations found. Please try a different address.",
            );
            return;
          }
          session.dropResults = dropResults;
          session.step = "SELECT_DROP";
          await sendPlacesList(phone, dropResults, "📍 Choose Dropoff");
        }
        break;

      // ---------------- SELECT DROP ---------------- //
      case "SELECT_DROP": {
        // User shared a live/pinned location instead of picking from the list —
        // honor it directly rather than re-showing stale search results.
        if (isLocationMessage(msg)) {
          const { latitude: dropLat, longitude: dropLng } = msg.location;
          await sendMessage(phone, "🔍 Locating your destination...");
          const dropGeocoded = await reverseGeocode(dropLat, dropLng);
          session.drop = dropGeocoded
            ? {
                address: dropGeocoded.address,
                coordinates: dropGeocoded.coordinates,
                scheduleDateAfter: 0,
                scheduleDateBefore: 0,
              }
            : extractLocation(msg);
          session.dropResults = null;

          const vehiclesFromLocation = await getVehicleTypes(
            session.auth.token,
            session.auth.customerId,
            session.pickup.coordinates,
          );
          session.vehicleTypes = vehiclesFromLocation.map((v: any) => ({
            id: v.id,
            title: v.title,
            description: v.description || "",
          }));
          session.step = "ASK_VEHICLE";
          await sendVehicleList(phone, session.vehicleTypes);
          break;
        }

        const dropId = msg?.interactive?.list_reply?.id;

        if (dropId === "place_none") {
          session.step = "ASK_DROP";
          await sendMessage(
            phone,
            "📍 Please enter your destination address again:",
          );
          break;
        }

        // No valid list selection — if the user typed free text instead of
        // tapping the list, treat it as a brand-new search rather than
        // silently re-showing the previous, now-irrelevant results.
        if (!dropId && msg?.text?.body) {
          const newDropResults = await searchPlaces(msg.text.body);
          if (!newDropResults.length) {
            await sendMessage(
              phone,
              "❌ No locations found. Please try a different address.",
            );
            return;
          }
          session.dropResults = newDropResults;
          await sendPlacesList(phone, newDropResults, "📍 Choose Dropoff");
          break;
        }

        const dropIdx = parseInt(dropId?.split("_")[1]);
        const dropPlace = session.dropResults?.[dropIdx];

        if (!dropPlace || isNaN(dropIdx)) {
          await sendPlacesList(phone, session.dropResults, "📍 Choose Dropoff");
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
          session.pickup.coordinates,
        );
        session.vehicleTypes = vehicles.map((v: any) => ({
          id: v.id,
          title: v.title,
          description: v.description || "",
        }));
        session.step = "ASK_VEHICLE";
        await sendVehicleList(phone, session.vehicleTypes);
        break;
      }

      // ---------------- VEHICLE ---------------- //
      case "ASK_VEHICLE":
        const selectedId = msg?.interactive?.list_reply?.id;
        const selected = session.vehicleTypes.find(
          (v: any) => v.id === selectedId,
        );

        if (!selected) {
          await sendVehicleList(phone, session.vehicleTypes);
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

        await sendConfirmButtons(
          phone,
          session.pickup.address,
          session.drop.address,
          selected.title,
        );
        break;

      // ---------------- CONFIRM ---------------- //
      case "CONFIRM":
        const reply = msg?.interactive?.button_reply?.id;

        if (!reply) {
          // User sent a text instead of tapping a button — re-send the buttons
          await sendConfirmButtons(
            phone,
            session.pickup.address,
            session.drop.address,
            session.selectedVehicleTitle,
          );
          return;
        }

        if (reply === "confirm_no") {
          await sendMessage(phone, "❌ Booking cancelled.");
          session = { step: "ASK_PICKUP", auth: session.auth };
          await sendMessage(phone, PICKUP_PROMPT);
          break;
        }

        await sendMessage(phone, "⏳ Booking your ride, please wait...");

        const orderRes = await createOrder(session, phone);
        // Order shape (from the cancel/GET responses): id, state, version,
        // currency, proposed_price_minor, estimated_price_minor.
        const order = orderRes.data || {};
        const orderId = order.id;
        const trackUrl = order.track_url || order.tracking_url;
        const proposedMinor = order.proposed_price_minor ?? PROPOSED_PRICE_MINOR;

        await sendBookingConfirmation(phone, {
          orderId,
          status: order.state ? humanize(String(order.state)) : undefined,
          pickup: session.pickup.address,
          drop: session.drop.address,
          vehicle: session.selectedVehicleTitle,
          fare: formatMoney(proposedMinor, order.currency),
          estimatedFare:
            order.estimated_price_minor != null &&
            order.estimated_price_minor !== proposedMinor
              ? formatMoney(order.estimated_price_minor, order.currency)
              : undefined,
          payment:
            PAYMENT_LABELS[ORDER_DEFAULTS.payment_method] ||
            humanize(ORDER_DEFAULTS.payment_method),
          options: ORDER_DEFAULTS.trip_options.map(
            (o) => TRIP_OPTION_LABELS[o] || humanize(o),
          ),
        });

        if (trackUrl) {
          await sendLinkButton(
            phone,
            "📡 Follow your ride live on the map.",
            "Track ride",
            trackUrl,
          );
        }

        // Keep auth + order id; wait for "Book another" / "All done" / "Cancel ride"
        session = { step: "POST_BOOKING", auth: session.auth, lastOrderId: orderId };
        break;

      // ---------------- AFTER BOOKING ---------------- //
      case "POST_BOOKING": {
        const postReply = msg?.interactive?.button_reply?.id;

        // "Cancel ride" button (or typing "cancel"): ask before cancelling.
        if ((postReply === "post_cancel" || msgText === "cancel") && session.lastOrderId) {
          session.step = "CONFIRM_CANCEL";
          await sendButtons(
            phone,
            "⚠️ Are you sure you want to cancel this ride?",
            [
              { id: "cancel_yes", title: "Yes, cancel" },
              { id: "cancel_no", title: "No, keep ride" },
            ],
          );
          break;
        }

        if (postReply === "post_cancel") {
          // Tapped "Cancel ride" on an older message after it was already cancelled.
          await sendButtons(phone, "ℹ️ That ride is already cancelled.", BOOK_AGAIN_BUTTONS);
          return;
        }

        if (postReply === "post_done") {
          // START + saved token skips login and goes straight to pickup next time.
          session = { step: "START", auth: session.auth };
          await sendMessage(
            phone,
            "🙏 Thanks for booking with us! Have a safe trip.\n\nWhenever you need another ride, just send *Hi*.",
          );
          break;
        }

        session = { step: "ASK_PICKUP", auth: session.auth };

        if (postReply === "post_new_ride") {
          await sendMessage(phone, `🚕 Let's book your next ride!\n\n${PICKUP_PROMPT}`);
          break;
        }

        // Typed an address or shared a location instead of tapping a button:
        // treat it as the pickup for a new booking.
        await setSession(phone, session);
        return handleMessage(phone, msg);
      }

      // ---------------- CANCEL CONFIRMATION ---------------- //
      case "CONFIRM_CANCEL": {
        const cancelReply = msg?.interactive?.button_reply?.id;

        if (cancelReply === "cancel_no") {
          session.step = "POST_BOOKING";
          await sendButtons(phone, "👍 Great, your ride is still on!", [
            ...BOOK_AGAIN_BUTTONS,
            { id: "post_cancel", title: "❌ Cancel ride" },
          ]);
          break;
        }

        if (cancelReply !== "cancel_yes") {
          await sendButtons(
            phone,
            "Please tap a button: do you want to cancel this ride?",
            [
              { id: "cancel_yes", title: "Yes, cancel" },
              { id: "cancel_no", title: "No, keep ride" },
            ],
          );
          return;
        }

        const cancelledOrderId = session.lastOrderId;
        try {
          const cancelled = await cancelOrder(session.auth.token, cancelledOrderId);
          console.log("[cancel] order", cancelled.id, "state:", cancelled.state);
        } catch (cancelErr: any) {
          const cancelStatus = cancelErr?.response?.status;
          // 401 = token expired: let the main handler re-login.
          if (!cancelStatus || cancelStatus === 401 || cancelStatus >= 500) {
            throw cancelErr;
          }
          // 4xx: the backend refused, e.g. the ride already started.
          console.error("[cancel] rejected:", cancelErr.response.data);
          session.step = "POST_BOOKING";
          await sendButtons(
            phone,
            "😕 Sorry, this ride can't be cancelled right now — it may already be in progress.",
            BOOK_AGAIN_BUTTONS,
          );
          break;
        }

        // No lastOrderId: the cancelled ride can't be cancelled again.
        session = { step: "POST_BOOKING", auth: session.auth };
        await sendButtons(
          phone,
          `✅ Your ride has been cancelled.\n\n🆔 Booking ID: ${cancelledOrderId}\n\nNeed a ride again?`,
          BOOK_AGAIN_BUTTONS,
        );
        break;
      }
    }

    if (session) {
      await setSession(phone, session);
    } else {
      await deleteSession(phone);
    }
  } catch (err: any) {
    const status = err?.response?.status;
    console.error("Flow Error:", err?.response?.data || err.message);

    if (status === 401 && session?.auth?.token) {
      // Customer token expired — restart auth. login() can fail too, so guard it
      // and always reply to the customer instead of throwing out of the handler.
      await deleteSession(phone);
      try {
        const { loginHandle } = await login(phone);
        await sendMessage(
          phone,
          "🔐 Your session expired. A new OTP has been sent — please enter it:",
        );
        await setSession(phone, { step: "ASK_OTP", loginHandle });
      } catch (loginErr: any) {
        console.error(
          "Re-login failed:",
          loginErr?.response?.data || loginErr.message,
        );
        await sendMessage(phone, "⚠️ Something went wrong. Please try again.");
      }
    } else {
      await sendMessage(phone, "⚠️ Something went wrong. Please try again.");
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
