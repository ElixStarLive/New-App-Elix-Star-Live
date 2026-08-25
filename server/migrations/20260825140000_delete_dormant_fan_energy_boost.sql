-- Remove dormant fan_energy_boost setting seeded before PAGE-078 cleanup.
DELETE FROM engagement_settings WHERE key = 'fan_energy_boost';
