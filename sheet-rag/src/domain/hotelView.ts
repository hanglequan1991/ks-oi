// Public JSON shapes and serializers (technical-design.html sections 9 and 11.3).
// Database rows go in, public views come out. The final price is computed here,
// so base prices never reach the output. No I/O, no Hono, no D1: imports only
// src/domain/.

import { finalPrice } from "./pricing";

export type Lang = "vi" | "en"; // same literal union as the web layer

export interface PricingOpts {
  feePercent: number;
  showFeeNote: boolean;
}

export interface PriceView {
  amount: number;
  currency: "VND";
  unit: "night";
  includesFeePercent?: number;
}

/** Final price for a base price, or null when there is no base price (never 0). */
export function priceView(
  base: number | null | undefined,
  o: PricingOpts,
): PriceView | null {
  if (base === null || base === undefined) return null;
  const view: PriceView = {
    amount: finalPrice(base, o.feePercent),
    currency: "VND",
    unit: "night",
  };
  if (o.showFeeNote) view.includesFeePercent = o.feePercent;
  return view;
}

// ---- Row types (what src/db/* returns). Base prices exist only here. ----

export interface HotelListRow {
  slug: string;
  name: string;
  city_slug: string;
  city_name_vi: string;
  city_name_en: string | null;
  stars: number | null;
  address: string | null;
  area: string | null;
  min_base_price: number | null;
  image_url: string | null;
}

export interface HotelRow {
  id: string;
  slug: string;
  name: string;
  city_slug: string;
  city_name_vi: string;
  city_name_en: string | null;
  stars: number | null;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  description_vi: string | null;
  description_en: string | null;
  synced_at: string;
}

export interface RoomRow {
  id: string;
  name: string;
  bed_type: string | null;
  size_m2: number | null;
  max_guests: number | null;
  view: string | null;
  description: string | null;
  base_price: number | null;
  position: number;
}

export interface RuleRow {
  room_id: string | null;
  raw_text: string;
  synced_at: string;
}

export interface FacilityRow {
  code: string;
  label_vi: string;
  label_en: string | null;
  confirmed: number;
}

export interface ImageRow {
  url: string;
  alt_vi: string | null;
  position: number;
}

// ---- Public view types. No base price fields anywhere. ----

export interface BookingRuleView {
  text: string;
  syncedAt: string;
}

export interface HotelListItem {
  slug: string;
  name: string;
  city: { slug: string; name: string };
  stars: number | null;
  address: string | null;
  area: string | null;
  image: string | null;
  price: PriceView | null;
}

export interface RoomView {
  id: string;
  name: string;
  bedType: string | null;
  sizeM2: number | null;
  maxGuests: number | null;
  view: string | null;
  description: string | null;
  price: PriceView | null;
  bookingRules: BookingRuleView | null;
}

export interface HotelDetail {
  slug: string;
  name: string;
  city: { slug: string; name: string };
  stars: number | null;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  images: { url: string; alt: string | null }[];
  facilities: { code: string; label: string; confirmed: boolean }[];
  rooms: RoomView[];
  bookingRules: BookingRuleView | null;
  disclaimer: string;
  dataUpdatedAt: string;
}

export interface CityItem {
  slug: string;
  name: string;
  nameVi: string;
  nameEn: string | null;
}

// ---- Helpers ----

/** English value when lang is 'en' and it is not empty, otherwise Vietnamese. */
function pickLang(vi: string, en: string | null, lang: Lang): string {
  if (lang === "en" && en !== null && en.trim() !== "") return en;
  return vi;
}

/** Latest rule (by synced_at) among those matching the predicate, or null. */
function latestRule(
  rules: RuleRow[],
  match: (rule: RuleRow) => boolean,
): BookingRuleView | null {
  let best: RuleRow | null = null;
  for (const rule of rules) {
    if (!match(rule)) continue;
    if (best === null || Date.parse(rule.synced_at) > Date.parse(best.synced_at)) {
      best = rule;
    }
  }
  return best === null
    ? null
    : { text: best.raw_text, syncedAt: best.synced_at };
}

// ---- Serializers ----

export function toHotelListItem(
  row: HotelListRow,
  lang: Lang,
  o: PricingOpts,
): HotelListItem {
  return {
    slug: row.slug,
    name: row.name,
    city: {
      slug: row.city_slug,
      name: pickLang(row.city_name_vi, row.city_name_en, lang),
    },
    stars: row.stars,
    address: row.address,
    area: row.area,
    image: row.image_url,
    price: priceView(row.min_base_price, o),
  };
}

export function toHotelDetail(
  input: {
    hotel: HotelRow;
    rooms: RoomRow[];
    rules: RuleRow[];
    facilities: FacilityRow[];
    images: ImageRow[];
  },
  lang: Lang,
  o: PricingOpts & { disclaimerVi: string; disclaimerEn: string },
): HotelDetail {
  const { hotel, rooms, rules, facilities, images } = input;
  const pricing: PricingOpts = { feePercent: o.feePercent, showFeeNote: o.showFeeNote };

  return {
    slug: hotel.slug,
    name: hotel.name,
    city: {
      slug: hotel.city_slug,
      name: pickLang(hotel.city_name_vi, hotel.city_name_en, lang),
    },
    stars: hotel.stars,
    address: hotel.address,
    area: hotel.area,
    lat: hotel.lat,
    lng: hotel.lng,
    description: pickLang(hotel.description_vi ?? "", hotel.description_en, lang) || null,
    images: images.map((img) => ({ url: img.url, alt: img.alt_vi })),
    facilities: facilities.map((f) => ({
      code: f.code,
      label: pickLang(f.label_vi, f.label_en, lang),
      confirmed: f.confirmed === 1,
    })),
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      bedType: room.bed_type,
      sizeM2: room.size_m2,
      maxGuests: room.max_guests,
      view: room.view,
      description: room.description,
      price: priceView(room.base_price, pricing),
      bookingRules: latestRule(rules, (r) => r.room_id === room.id),
    })),
    bookingRules: latestRule(rules, (r) => r.room_id === null),
    disclaimer: lang === "en" ? o.disclaimerEn : o.disclaimerVi,
    dataUpdatedAt: hotel.synced_at,
  };
}

export function toCityItem(
  row: { slug: string; name_vi: string; name_en: string | null },
  lang: Lang,
): CityItem {
  return {
    slug: row.slug,
    name: pickLang(row.name_vi, row.name_en, lang),
    nameVi: row.name_vi,
    nameEn: row.name_en,
  };
}
