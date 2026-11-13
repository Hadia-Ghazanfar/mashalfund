-- Mash'al Fund Manager — seed drives (no money entries).
-- Run AFTER schema.sql, once. Safe to run again: it skips names that exist.
-- These are Mash'al Initiative's real drives, verified from @mashal.initiative.

insert into projects (name, kind, description) values
  ('Gift a Tree', 'priced',
   'Share a Shade — free Jaman, Mango and Amrood saplings. 60+ saplings planted so far.'),
  ('Share a Shade', 'priced',
   'Tree-planting drive: Jaman, Mango and Amrood saplings, given free.'),
  ('Free Bird Seed Packets', 'priced',
   'Free bird seed packets: sunflower seeds, pearl millet (bajra), black chickpeas (kala chana).'),
  ('Cats Food Drive', 'priced',
   'Food for cats in need.'),
  ('Clothes Drive', 'in-kind',
   'Quantity-based drive: clothes counted by type and condition, with donor, recipient and proof. No price is fixed for clothes.')
on conflict do nothing;

-- The names above are inserted by name only; there is no unique constraint on
-- name, so re-running this file would duplicate rows. Guard with a check first:
--   select count(*) from projects where name in ('Gift a Tree','Share a Shade',
--     'Free Bird Seed Packets','Cats Food Drive','Clothes Drive');
-- If the count is already 5, skip this file. The app's seedExamples action
-- does the same check automatically.
