// src/services/metaService.js
import axios from "axios";
function graphUrl() {
  return `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
}

function metaHeaders() {
  return {
    Authorization: `Bearer ${process.env.META_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export const sendMessage = async (to: any, text: any) => {
  await axios.post(
    graphUrl(),
    { messaging_product: "whatsapp", to, text: { body: text } },
    { headers: metaHeaders() },
  );
};

export const sendVehicleList = async (to: any, vehicles: any) => {
  const rows = vehicles.map((v: any) => ({
    id: v.id,
    title: v.title,
    description: v.description || "",
  }));

  await axios.post(
    graphUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "🚗 Choose your ride" },
        body: {
          text: "Select a vehicle type for your trip\n\n(Wrong destination? Type *back* to redo it.)",
        },
        footer: { text: "Tap to view options" },
        action: {
          button: "View Vehicles",
          sections: [
            {
              title: "Available Vehicles",
              rows,
            },
          ],
        },
      },
    },
    { headers: metaHeaders() },
  );
};

export const sendPlacesList = async (to: any, places: any, header: any) => {
  const rows = places.map((p: any, i: any) => ({
    id: `place_${i}`,
    title: p.name.substring(0, 24),
    description: p.address.substring(0, 72),
  }));

  // Always add a "None of the above" option
  rows.push({
    id: "place_none",
    title: "None of the above",
    description: "Search again with a different address",
  });

  await axios.post(
    graphUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: header },
        body: {
          text: `We found ${places.length} address(es) near your location.`,
        },
        footer: { text: "Tap to select" },
        action: {
          button: "Choose Location",
          sections: [{ title: "Nearby Places", rows }],
        },
      },
    },
    { headers: metaHeaders() },
  );
};

export const sendConfirmButtons = async (
  to: any,
  pickup: any,
  drop: any,
  vehicle: any,
) => {
  await axios.post(
    graphUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: `*Review Trip* 🗺️\n\n📍 *Pickup:*\n${pickup}\n\n📍 *Dropoff:*\n${drop}\n\n🚗 *Vehicle:* ${vehicle}\n\n(Wrong vehicle? Type *back* to redo it.)`,
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "confirm_yes", title: "Confirm & Process" },
            },
            { type: "reply", reply: { id: "confirm_no", title: "Cancel" } },
          ],
        },
      },
    },
    { headers: metaHeaders() },
  );
};
