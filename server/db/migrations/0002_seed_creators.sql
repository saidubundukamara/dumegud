-- Seed data for Phase 2. Admins manage both lists afterwards (Phase 8); re-running is safe.

INSERT INTO "categories" ("slug", "name", "position") VALUES
  ('music', 'Music', 1),
  ('art-design', 'Art & design', 2),
  ('photography', 'Photography', 3),
  ('video-film', 'Video & film', 4),
  ('writing', 'Writing & poetry', 5),
  ('podcasts', 'Podcasts', 6),
  ('comedy', 'Comedy', 7),
  ('education', 'Education & tutoring', 8),
  ('tech', 'Tech & software', 9),
  ('fashion-beauty', 'Fashion & beauty', 10),
  ('food', 'Food & cooking', 11),
  ('sports-fitness', 'Sports & fitness', 12),
  ('gaming', 'Gaming', 13),
  ('community', 'Community & causes', 14),
  ('other', 'Other', 99)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Routes are also blocked in code (lib/handle.ts ROUTE_HANDLES); these cover brand, staff,
-- payment-provider and impersonation-prone names.
INSERT INTO "reserved_handles" ("handle") VALUES
  ('about'), ('account'), ('admin'), ('administrator'), ('afrimoney'), ('api'), ('app'), ('auth'),
  ('billing'), ('blog'), ('careers'), ('checkout'), ('contact'), ('dashboard'), ('docs'),
  ('dumegud'), ('dumegud_official'), ('dumegud_support'), ('dumegud_team'), ('faq'), ('help'),
  ('helpdesk'), ('home'), ('info'), ('legal'), ('library'), ('login'), ('logout'), ('mail'),
  ('monime'), ('news'), ('official'), ('orange'), ('orangemoney'), ('p'), ('payment'), ('payments'),
  ('payout'), ('payouts'), ('press'), ('pricing'), ('privacy'), ('register'), ('root'), ('security'),
  ('settings'), ('shop'), ('signin'), ('signup'), ('staff'), ('status'), ('store'), ('support'),
  ('system'), ('team'), ('terms'), ('verify'), ('wallet'), ('webmaster'), ('www')
ON CONFLICT ("handle") DO NOTHING;
