// src/services/placesService.js
import 'dotenv/config'
import axios from 'axios';

const GOOGLE_PLACES_API = process.env.GOOGLE_PLACES_API!;

function getApiKey() {
  return new URL(GOOGLE_PLACES_API).searchParams.get("key");
}

export const searchPlaces = async (query: any) => {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/place/textsearch/json",
    {
      params: {
        query,
        key: getApiKey(),
        language: "en",
      },
    },
  );

  return (res.data.results || []).slice(0, 4).map((place: any) => ({
    name: place.name,
    address: place.formatted_address,
    coordinates: [place.geometry.location.lng, place.geometry.location.lat],
  }));
};

export const reverseGeocode = async (latitude: any, longitude: any) => {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        latlng: `${latitude},${longitude}`,
        key: getApiKey(),
        language: "en",
      },
    },
  );

  const result = res.data.results?.[0];
  if (!result) return null;

  return {
    name: result.address_components?.[0]?.long_name || result.formatted_address,
    address: result.formatted_address,
    coordinates: [longitude, latitude],
  };
};
