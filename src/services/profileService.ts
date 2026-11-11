// src/services/profileService.ts
import axios from "axios";

const api = axios.create({
  baseURL: process.env.BASE_URL,
  timeout: 15000,
});

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// WhatsApp sends numbers without "+" (e.g. 919265825711); the API expects E.164.
const toE164 = (phone: string) => (phone.startsWith("+") ? phone : `+${phone}`);

// Returns the id of the active ride-hailing service profile (currently "Ridy").
export const getServiceProfileId = async (token: string) => {
  const res = await api.get("/profile/v1/service-profiles", {
    headers: authHeader(token),
  });
  const items: any[] = res.data?.items || [];
  const profile =
    items.find((p) => p.status === "active" && p.service_type === "ride_hailing") ||
    items.find((p) => p.status === "active");
  if (!profile) {
    throw new Error(`No active service profile found: ${JSON.stringify(res.data)}`);
  }
  return profile.id as string;
};

const getRegistrations = async (token: string, customerId: string) => {
  const res = await api.get(`/profile/v1/customers/${customerId}/registrations`, {
    headers: authHeader(token),
  });
  return (res.data?.items || []) as any[];
};

const register = async (
  token: string,
  customerId: string,
  serviceProfileId: string,
  phone: string,
) => {
  const form = new FormData();
  form.append("phone_number", toE164(phone));
  const res = await api.post(
    `/profile/v1/customers/${customerId}/registrations/${serviceProfileId}`,
    form,
    { headers: authHeader(token) },
  );
  return res.data;
};

// A customer must be registered with the service profile before ordering.
// Registers them if needed and returns the service profile id to order with.
export const ensureRegistered = async (
  token: string,
  customerId: string,
  phone: string,
) => {
  const serviceProfileId = await getServiceProfileId(token);

  const existing = (await getRegistrations(token, customerId)).find(
    (r) => r.service_profile_id === serviceProfileId,
  );

  if (existing) {
    if (existing.status !== "active") {
      throw new Error(
        `Registration ${existing.id} for customer ${customerId} is ${existing.status}`,
      );
    }
    console.log("[profile] customer already registered:", customerId);
  } else {
    const created = await register(token, customerId, serviceProfileId, phone);
    console.log("[profile] registered customer:", customerId, "registration:", created?.id);
  }

  return serviceProfileId;
};
