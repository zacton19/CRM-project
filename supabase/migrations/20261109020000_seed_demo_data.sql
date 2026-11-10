-- seed_demo_data(): fills the signed-in user's account with realistic sample clients, quotes,
-- a scheduled job and email/call/visit history, so the AI features have something to work on.
-- Called from Settings → "Load demo data". Dates are relative to now() so the demo never
-- goes stale. Running it again replaces the previous demo rows (found by the "Demo data"
-- prefix on client notes) and never touches your real clients.

create or replace function public.seed_demo_data()
returns void
language plpgsql
security invoker -- runs as the caller, so RLS and the user_id defaults apply as normal
set search_path = ''
as $$
declare
  c_harbor uuid; c_rosa uuid; c_desai uuid; c_dental uuid; c_becker uuid; c_greenway uuid; c_bakery uuid;
  q_harbor uuid; q_rosa uuid; q_desai uuid; q_dental uuid; q_becker uuid; q_greenway uuid; q_bakery uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;

  -- Cascades remove the old demo quotes, jobs and interactions too.
  delete from public.clients where notes like 'Demo data%';

  -- Clients -------------------------------------------------------------------------------
  insert into public.clients (name, phone, email, address, notes) values
    ('Harbor View Apartments (Dana Whitfield)', '555-0142', 'dana.whitfield@harborviewapts.example',
     '400 Harbor Blvd, Building A', 'Demo data. Property manager for 3 buildings.')
    returning id into c_harbor;
  insert into public.clients (name, phone, email, address, notes) values
    ('Rosa''s Trattoria', '555-0177', 'rosa@rosastrattoria.example', '18 Main St', 'Demo data. Storefront.')
    returning id into c_rosa;
  insert into public.clients (name, phone, email, address, notes) values
    ('Mark & Priya Desai', '555-0103', 'priya.desai@mail.example', '9 Willow Lane', 'Demo data. Two-storey house, dog in yard.')
    returning id into c_desai;
  insert into public.clients (name, phone, email, address, notes) values
    ('Lakeside Dental (Karen Ortiz)', '555-0190', 'office@lakesidedental.example', '250 Lake Rd, Suite 2',
     'Demo data. Office manager Karen; Dr. Chen signs off on spend.')
    returning id into c_dental;
  insert into public.clients (name, phone, email, address, notes) values
    ('Tom Becker', '555-0111', 'tbecker@mail.example', '72 Oak Ave', 'Demo data. Price-sensitive.')
    returning id into c_becker;
  insert into public.clients (name, phone, email, address, notes) values
    ('Greenway Office Park (Sam Lee)', '555-0155', 'slee@greenwayop.example', '1 Greenway Plaza',
     'Demo data. Facilities lead. 6-storey glass frontage.')
    returning id into c_greenway;
  insert into public.clients (name, phone, email, address, notes) values
    ('Sunrise Bakery', '555-0168', 'hello@sunrisebakery.example', '5 Market Sq', 'Demo data. Regular customer.')
    returning id into c_bakery;

  -- Quotes --------------------------------------------------------------------------------
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_harbor, 'Quarterly exterior window cleaning, 3 buildings (96 units)', 4800, 'sent', now() - interval '6 days')
    returning id into q_harbor;
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_rosa, 'Monthly storefront glass, inside and out', 180, 'sent', now() - interval '20 days')
    returning id into q_rosa;
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_desai, 'Full house inside and out plus screens (32 panes)', 425, 'draft', now() - interval '2 days')
    returning id into q_desai;
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_dental, 'Office windows every 2 months, both floors', 650, 'sent', now() - interval '3 days')
    returning id into q_dental;
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_becker, 'Exterior windows and gutter clear', 310, 'declined', now() - interval '30 days')
    returning id into q_becker;
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_greenway, 'Annual contract: 4 high-rise exterior cleans', 12500, 'sent', now() - interval '10 days')
    returning id into q_greenway;
  insert into public.quotes (client_id, description, amount, status, created_at) values
    (c_bakery, 'Storefront and skylight clean', 220, 'accepted', now() - interval '14 days')
    returning id into q_bakery;

  insert into public.jobs (client_id, title, starts_at, duration_minutes, price) values
    (c_bakery, 'Storefront and skylight clean', date_trunc('day', now()) + interval '3 days 7 hours', 90, 220);

  -- Interactions --------------------------------------------------------------------------
  insert into public.interactions (client_id, quote_id, kind, occurred_at, body) values
    (c_harbor, q_harbor, 'visit', now() - interval '8 days', $t$Walked all 3 buildings with Dana. Building C has the hard-to-reach atrium glass, needs the
water-fed pole. She wants it done before the holiday tenant event on Dec 15. Their current
cleaner no-showed twice this year, so reliability matters more to her than price.$t$),
    (c_harbor, q_harbor, 'email', now() - interval '2 days', $t$From: Dana Whitfield
Subject: Re: Quote for Harbor View

Hi, thanks for the quote. The owners are happy with $4,800 per quarter. Before I can sign
I need two things: a copy of your liability insurance certificate, and confirmation you can
do the first clean the week of Dec 7. If you can send both by Friday I'll get the contract
signed early next week.

Dana$t$),
    (c_rosa, q_rosa, 'visit', now() - interval '21 days', $t$Measured the storefront. Two big front panes plus the door. Rosa asked for early-morning
cleans before 10am opening. She said she'd "think about it" after seeing the price.$t$),
    (c_rosa, q_rosa, 'email', now() - interval '12 days', $t$To: Rosa
Subject: Following up on your storefront quote

Hi Rosa, just checking in on the monthly storefront quote ($180/month). Happy to adjust the
schedule around your opening hours. Let me know if you have any questions.
(No reply yet.)$t$),
    (c_desai, q_desai, 'call', now() - interval '2 days', $t$Priya called. They have family visiting for Thanksgiving and want everything done before
Nov 22. Asked whether we can add gutter cleaning to the same visit and what that would cost.
Asked me to send the final quote by tomorrow so she can book. Very keen.$t$),
    (c_dental, q_dental, 'email', now() - interval '1 day', $t$From: Karen Ortiz
Subject: Re: Window cleaning proposal

Hello, the practice has budgeted up to $700 for this, so $650 works. Dr. Chen has final
sign-off and is back next Tuesday. Could you send over a sample service agreement so I can
put it in front of him? Also, can visits be on Saturdays when we're closed?

Karen$t$),
    (c_becker, q_becker, 'email', now() - interval '28 days', $t$From: Tom Becker
Subject: Re: Quote

Thanks but $310 is more than I want to spend right now. I'll probably do the windows myself
this year. Maybe in the spring.$t$),
    (c_greenway, q_greenway, 'visit', now() - interval '11 days', $t$Meeting with Sam Lee on site. 6 storeys, mostly curtain-wall glass; needs a rope-access
subcontractor for floors 4-6. They are also getting a bid from CrystalClear. Sam said the
decision is made by the regional office and "these usually take a couple of months".$t$),
    (c_greenway, q_greenway, 'email', now() - interval '4 days', $t$From: Sam Lee
Subject: Re: Greenway annual contract

Got your proposal, thanks. Regional office wants to compare the two bids at their quarterly
review in January. Can you include your safety certifications and a reference from another
commercial client? No rush before the new year.$t$),
    (c_bakery, q_bakery, 'call', now() - interval '14 days', $t$Bakery owner accepted the quote on the phone. Wants the skylight done too, already included.
Booked for later this month. Asked about a regular monthly slot afterwards.$t$),
    (c_bakery, null, 'note', now() - interval '40 days', $t$Referred by Rosa's Trattoria. Pays on the day, prefers cash or card on site.$t$);
end;
$$;

revoke execute on function public.seed_demo_data() from public, anon;
grant execute on function public.seed_demo_data() to authenticated;
