"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reverseGeocode = exports.searchPlaces = void 0;
// src/services/placesService.js
require("dotenv/config");
const axios_1 = __importDefault(require("axios"));
const GOOGLE_PLACES_API = process.env.GOOGLE_PLACES_API;
function getApiKey() {
    return new URL(GOOGLE_PLACES_API).searchParams.get("key");
}
const searchPlaces = async (query) => {
    const res = await axios_1.default.get("https://maps.googleapis.com/maps/api/place/textsearch/json", {
        params: {
            query,
            key: getApiKey(),
            language: "en",
        },
    });
    return (res.data.results || []).slice(0, 4).map((place) => ({
        name: place.name,
        address: place.formatted_address,
        coordinates: [place.geometry.location.lng, place.geometry.location.lat],
    }));
};
exports.searchPlaces = searchPlaces;
const reverseGeocode = async (latitude, longitude) => {
    const res = await axios_1.default.get("https://maps.googleapis.com/maps/api/geocode/json", {
        params: {
            latlng: `${latitude},${longitude}`,
            key: getApiKey(),
            language: "en",
        },
    });
    const result = res.data.results?.[0];
    if (!result)
        return null;
    return {
        name: result.address_components?.[0]?.long_name || result.formatted_address,
        address: result.formatted_address,
        coordinates: [longitude, latitude],
    };
};
exports.reverseGeocode = reverseGeocode;
//# sourceMappingURL=placesService.js.map