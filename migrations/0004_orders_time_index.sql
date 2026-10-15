-- Super admin: the transaction list across all shops is read newest first by time.
-- Without this index, every super admin page load would scan the whole orders table.
CREATE INDEX orders_time ON orders(created_at);
