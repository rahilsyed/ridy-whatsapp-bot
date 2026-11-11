// src/services/metaService.js
import axios from "axios";
// Without a timeout a network problem makes the bot hang silently instead of erroring.
const meta = axios.create({ timeout: 15000 });
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
  await meta.post(
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

  await meta.post(
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

  await meta.post(
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
  await meta.post(
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

// WhatsApp limits: header 60 chars, body 1024, footer 60, button title 20.
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export const sendBookingConfirmation = async (
  to: any,
  booking: {
    orderId?: string;
    status?: string;
    pickup: string;
    drop: string;
    vehicle: string;
    fare?: string;
    estimatedFare?: string;
    payment?: string;
    options?: string[];
  },
) => {
  const buttons = [
    { type: "reply", reply: { id: "post_new_ride", title: "🚕 Book another" } },
    { type: "reply", reply: { id: "post_done", title: "👍 All done" } },
  ];
  // Max 3 reply buttons; cancelling needs the order id.
  if (booking.orderId) {
    buttons.push({ type: "reply", reply: { id: "post_cancel", title: "❌ Cancel ride" } });
  }

  const lines = [
    "Your ride request has been placed. We're finding a driver for you 🚖",
    "",
    booking.orderId ? `🆔 *Booking ID:* ${booking.orderId}` : null,
    booking.status ? `📌 *Status:* ${booking.status}` : null,
    "",
    `🟢 *Pickup*\n${clip(booking.pickup, 200)}`,
    "",
    `🔴 *Drop-off*\n${clip(booking.drop, 200)}`,
    "",
    `🚗 *Vehicle:* ${booking.vehicle}`,
    booking.options?.length ? `✨ *Extras:* ${booking.options.join(", ")}` : null,
    booking.fare ? `💰 *Your offer:* ${booking.fare}` : null,
    booking.estimatedFare ? `📊 *Estimated fare:* ${booking.estimatedFare}` : null,
    booking.payment ? `💳 *Payment:* ${booking.payment}` : null,
    "",
    "We'll message you here when your driver is on the way.",
  ].filter((l) => l !== null);

  await meta.post(
    graphUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "text", text: "✅ Ride booked!" },
        body: { text: clip(lines.join("\n"), 1024) },
        footer: { text: "Thank you for riding with us" },
        action: { buttons },
      },
    },
    { headers: metaHeaders() },
  );
};

// Plain message with up to 3 reply buttons.
export const sendButtons = async (
  to: any,
  body: string,
  buttons: { id: string; title: string }[],
) => {
  await meta.post(
    graphUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: clip(body, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: clip(b.title, 20) },
          })),
        },
      },
    },
    { headers: metaHeaders() },
  );
};

// A single "open link" button, e.g. to track the ride.
export const sendLinkButton = async (
  to: any,
  body: string,
  buttonText: string,
  url: string,
) => {
  await meta.post(
    graphUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: {
          name: "cta_url",
          parameters: { display_text: clip(buttonText, 20), url },
        },
      },
    },
    { headers: metaHeaders() },
  );
};
