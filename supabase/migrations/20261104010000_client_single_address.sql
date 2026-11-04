-- Clients have a single free-text address instead of line1/line2/city/postcode.
-- Existing addresses are merged into the new column (e.g. "1 High St, Flat 2, Leeds, LS1 1AA")
-- before the old columns are removed.

alter table public.clients add column address text;

update public.clients
set address = nullif(
  concat_ws(', ',
    nullif(trim(address_line1), ''),
    nullif(trim(address_line2), ''),
    nullif(trim(city), ''),
    nullif(trim(postcode), '')
  ),
  ''
);

alter table public.clients
  drop column address_line1,
  drop column address_line2,
  drop column city,
  drop column postcode;
