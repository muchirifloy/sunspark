/// <reference types="google.maps" />

"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useRef, useState } from "react";

const NAIROBI = { lat: -1.286389, lng: 36.817223 };
let configuredApiKey = "";
let googleMapsPromise: ReturnType<typeof loadLibraries> | null = null;

export function LocationPicker({ apiKey }: { apiKey: string }) {
  const autocompleteHostRef = useRef<HTMLDivElement>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [mapsReady, setMapsReady] = useState(false);
  const [status, setStatus] = useState(apiKey ? "Loading Google location search..." : "Google Maps needs its browser API key. You can still enter the address manually.");

  const selectCoordinates = useCallback((location: google.maps.LatLngLiteral, address: string) => {
    const lat = location.lat.toFixed(6);
    const lng = location.lng.toFixed(6);
    setDeliveryLocation(address);
    setLatitude(lat);
    setLongitude(lng);
    setMapUrl(buildMapUrl(lat, lng));
    mapRef.current?.panTo(location);
    mapRef.current?.setZoom(17);
    if (markerRef.current) markerRef.current.position = location;
  }, []);

  useEffect(() => {
    if (!apiKey || !autocompleteHostRef.current || !mapElementRef.current) return;
    let cancelled = false;
    const autocompleteHost = autocompleteHostRef.current;

    async function initializeGooglePicker() {
      try {
        const [{ Map }, { PlaceAutocompleteElement }, { AdvancedMarkerElement }, { Geocoder }] = await getGoogleMaps(apiKey);
        if (cancelled || !mapElementRef.current) return;

        const map = new Map(mapElementRef.current, {
          center: NAIROBI,
          clickableIcons: true,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          streetViewControl: false,
          zoom: 12,
        });
        const marker = new AdvancedMarkerElement({ map, position: NAIROBI, title: "Delivery point" });
        const geocoder = new Geocoder();
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = geocoder;

        const autocomplete = new PlaceAutocompleteElement({
          description: "Search Google Maps for the delivery address",
          includedRegionCodes: ["ke"],
          locationBias: { center: NAIROBI, radius: 80000 },
          placeholder: "Search estate, building, road or pickup point",
          requestedLanguage: "en",
          requestedRegion: "ke",
        });
        autocompleteHost.replaceChildren(autocomplete);
        autocomplete.addEventListener("gmp-select", async (event) => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
          if (!place.location) {
            setStatus("Google could not find coordinates for that place. Please select another result.");
            return;
          }
          const address = place.formattedAddress || place.displayName || event.placePrediction.text.toString();
          selectCoordinates(place.location.toJSON(), address);
          setStatus("Location selected. Drag the map or tap a nearby point to fine-tune it.");
        });
        autocomplete.addEventListener("gmp-error", () => setStatus("Google location search is temporarily unavailable. Please try again."));

        map.addListener("click", async (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return;
          const location = event.latLng.toJSON();
          let address = `Pinned location (${location.lat.toFixed(6)}, ${location.lng.toFixed(6)})`;
          try {
            const response = await geocoder.geocode({ location });
            address = response.results[0]?.formatted_address || address;
          } catch {
            // Coordinates still provide an exact rider destination when reverse geocoding is unavailable.
          }
          selectCoordinates(location, address);
          setStatus("Exact delivery pin selected on the map.");
        });

        setMapsReady(true);
        setStatus("Search Google Maps or tap the map to choose the exact delivery point.");
      } catch {
        if (!cancelled) setStatus("Google Maps could not load. Check the API key and enabled Maps/Places APIs, or enter the address manually.");
      }
    }

    void initializeGooglePicker();
    return () => {
      cancelled = true;
      autocompleteHost.replaceChildren();
      mapRef.current = null;
      markerRef.current = null;
      geocoderRef.current = null;
    };
  }, [apiKey, selectCoordinates]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus("Current location is not available on this device.");
      return;
    }

    setStatus("Getting your current location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        selectCoordinates(location, `Current location (${location.lat.toFixed(6)}, ${location.lng.toFixed(6)})`);
        setStatus("Current location attached. You can fine-tune the pin on the map.");
        if (geocoderRef.current) {
          void geocoderRef.current.geocode({ location }).then((response) => {
            const address = response.results[0]?.formatted_address;
            if (address) selectCoordinates(location, address);
          }).catch(() => undefined);
        }
      },
      () => setStatus("Location permission was not allowed. Search for the address instead."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  function updateManualLocation(value: string) {
    setManualLocation(value);
    setDeliveryLocation(value);
    setLatitude("");
    setLongitude("");
    setMapUrl(value.trim().length >= 3 ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${value}, Kenya`)}` : "");
  }

  return (
    <fieldset className="location-picker">
      <legend>Delivery location</legend>
      {apiKey ? <div aria-label="Google Maps place search" className="location-google-autocomplete" ref={autocompleteHostRef} /> : (
        <label>
          Address or landmark
          <input
            autoComplete="street-address"
            onChange={(event) => updateManualLocation(event.target.value)}
            placeholder="Estate, building, road or pickup point"
            value={manualLocation}
          />
        </label>
      )}
      {apiKey ? <div aria-label="Choose the exact delivery point on Google Maps" className="location-map" ref={mapElementRef} /> : null}
      <input name="deliveryLocation" type="hidden" value={deliveryLocation} />
      <input name="deliveryMapUrl" type="hidden" value={mapUrl} />
      <input name="deliveryLatitude" type="hidden" value={latitude} />
      <input name="deliveryLongitude" type="hidden" value={longitude} />

      {deliveryLocation ? (
        <div className="location-selection" aria-live="polite">
          <span>Selected delivery point</span>
          <strong>{deliveryLocation}</strong>
          {latitude && longitude ? <small>{latitude}, {longitude}</small> : null}
        </div>
      ) : null}
      <div className="location-actions">
        <button className="secondary-btn" onClick={useCurrentLocation} type="button">Use current location</button>
        {mapUrl ? <a className="secondary-btn" href={mapUrl} rel="noreferrer" target="_blank">Open exact point in Google Maps</a> : null}
      </div>
      <p aria-live="polite">{status}</p>
      {apiKey && !mapsReady ? <div aria-hidden="true" className="location-map-loading">Loading map...</div> : null}
    </fieldset>
  );
}

function getGoogleMaps(apiKey: string) {
  if (!googleMapsPromise) {
    configuredApiKey = apiKey;
    setOptions({ authReferrerPolicy: "origin", key: apiKey, language: "en", region: "KE", v: "weekly" });
    googleMapsPromise = loadLibraries();
  } else if (configuredApiKey !== apiKey) {
    return Promise.reject(new Error("Google Maps is already configured with another key."));
  }
  return googleMapsPromise;
}

function loadLibraries() {
  return Promise.all([
    importLibrary("maps"),
    importLibrary("places"),
    importLibrary("marker"),
    importLibrary("geocoding"),
  ]);
}

function buildMapUrl(latitude: string, longitude: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
