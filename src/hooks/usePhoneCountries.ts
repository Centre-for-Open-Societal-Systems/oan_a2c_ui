import { COUNTRY_CODE_OPTIONS, type CountryCodeOption } from '@/components/ui/CountryCodeSelect';
import { fetchApi } from '@/lib/api/fetchApi';
import { useEffect, useState } from 'react';

// Same row shape as the grievance service's `phone_extensions`: `code` is the ISO
// country code and `isd` the dial code.
interface PhoneCountryRow {
  country?: unknown;
  code?: unknown;
  isd?: unknown;
}

// Flag assets that ship with the app, by ISO code. A country the service adds
// without one gets no flag rather than a broken image.
const FLAG_ISO_CODES = new Set(['et', 'tz', 'ke', 'ug', 'rw', 'sa', 'us']);

function toOptions(rows: PhoneCountryRow[]): CountryCodeOption[] {
  return rows.flatMap((row) => {
    if (typeof row.isd !== 'string' || typeof row.country !== 'string' || !row.isd || !row.country) return [];
    const iso = typeof row.code === 'string' ? row.code.toLowerCase() : '';
    return [
      FLAG_ISO_CODES.has(iso)
        ? { code: row.isd, country: row.country, flagUrl: `/images/flags/${iso}.svg` }
        : { code: row.isd, country: row.country },
    ];
  });
}

let pending: Promise<CountryCodeOption[]> | null = null;

// One request per page load, shared by every phone field. A failure is not cached,
// so the next field to mount tries again.
function loadPhoneCountries(): Promise<CountryCodeOption[]> {
  pending ??= fetchApi('v1/auth/metadata', { method: 'GET' })
    .then((res) => {
      const options = toOptions(res?.data?.auth?.phone_countries ?? []);
      if (options.length === 0) throw new Error('No phone countries in metadata');
      return options;
    })
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}

/**
 * Dial codes for a phone field's picker. Serves the built-in list at once and
 * swaps in the auth service's `phone_countries` once it answers, so an older
 * service, or one that is down, leaves the picker as it was.
 */
export function usePhoneCountries(): CountryCodeOption[] {
  const [options, setOptions] = useState<CountryCodeOption[]>(COUNTRY_CODE_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    loadPhoneCountries()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}
