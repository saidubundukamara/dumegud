-- PLACEHOLDER product settings (PRD §5.3/§13: file constraints and limits are not approved yet).
INSERT INTO "platform_settings" ("key", "value") VALUES
  ('products.minPrice', '500'),
  ('products.maxPrice', '500000'),
  ('uploads.maxBytes', '209715200'),
  ('uploads.allowedTypes', '["pdf","epub","mp3","wav","zip","png","jpg","webp"]'),
  ('downloads.defaultLimit', '5'),
  ('downloads.accessDays', '30')
ON CONFLICT ("key") DO NOTHING;
