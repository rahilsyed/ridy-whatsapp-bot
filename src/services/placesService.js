// src/services/placesService.js
const axios = require("axios");

function getApiKey() {
  return new URL(process.env.GOOGLE_PLACES_API).searchParams.get("key");
}

exports.searchPlaces = async (query) => {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/place/textsearch/json",
    {
      params: {
        query,
        key: getApiKey(),
        language: "en",
      },
    }
  );

  return (res.data.results || []).slice(0, 4).map((place) => ({
    name: place.name,
    address: place.formatted_address,
    coordinates: [place.geometry.location.lng, place.geometry.location.lat],
  }));
};

exports.reverseGeocode = async (latitude, longitude) => {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        latlng: `${latitude},${longitude}`,
        key: getApiKey(),
        language: "en",
      },
    }
  );

  const result = res.data.results?.[0];
  if (!result) return null;

  return {
    name: result.address_components?.[0]?.long_name || result.formatted_address,
    address: result.formatted_address,
    coordinates: [longitude, latitude],
  };
};
