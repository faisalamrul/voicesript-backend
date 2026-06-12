-- Update existing NULL city values before adding NOT NULL constraint
UPDATE jobs SET city = 'Remote' WHERE city IS NULL;

ALTER TABLE jobs ALTER COLUMN city SET NOT NULL;
