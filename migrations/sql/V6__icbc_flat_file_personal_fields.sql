INSERT INTO address_change.partner_flat_file_column
  (partner_id, position, field_key, column_name, min_width, created_by, updated_by)
SELECT partner_id, layout.position, layout.field_key, layout.column_name, layout.min_width,
       'migration', 'migration'
FROM address_change.partner_system partner
CROSS JOIN (VALUES
  (35, 'drivers_license_number', 'Driver licence number', 0),
  (36, 'height_cm', 'Height (cm)', 0),
  (37, 'weight_kg', 'Weight (kg)', 0),
  (38, 'security_keyword', 'Security keyword', 0)
) AS layout(position, field_key, column_name, min_width)
WHERE partner.partner_code = 'ICBC';
