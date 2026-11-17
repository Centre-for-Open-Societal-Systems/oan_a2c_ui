import { COUNTRY_CODE_OPTIONS, type CountryCodeOption } from '@/components/ui/CountryCodeSelect';
import { fetchApi } from '@/lib/api/fetchApi';
import { useEffect, useState } from 'react';

interface PhoneCountryRow {
  code?: unknown;
  country?: unknown;
  iso?: unknown;
}

// Flag assets that ship with the app, by dial code. A country the service adds
// without one gets no flag rather than a broken image.
const FLAGS_BY_CODE = new Map<string, string>([
  ['+251', '/images/flags/et.svg'],
  ['+255', '/images/flags/tz.svg'],
  ['+254', '/images/flags/ke.svg'],
  ['+256', '/images/flags/ug.svg'],
  ['+250', '/images/flags/rw.svg'],
  ['+966', '/images/flags/sa.svg'],
  ['+1', '/images/flags/us.svg'],
]);

function toOptions(rows: PhoneCountryRow[]): CountryCodeOption[] {
  return rows.flatMap((row) => {
    if (typeof row.code !== 'string' || typeof row.country !== 'string' || !row.code || !row.country) return [];
    const flagUrl = FLAGS_BY_CODE.get(row.code);
    return [flagUrl ? { code: row.code, country: row.country, flagUrl } : { code: row.code, country: row.country }];
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
