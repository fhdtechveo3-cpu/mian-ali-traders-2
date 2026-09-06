-- Migration for Unified Party & Khata System (Customers & Suppliers Merged)

-- 1. Ensure necessary columns exist on both tables
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS party_type TEXT NOT NULL DEFAULT 'both';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS party_type TEXT NOT NULL DEFAULT 'both';

-- 2. Synchronize existing customers into suppliers
INSERT INTO public.suppliers (id, name, phone, city, address, branch_id, party_type)
SELECT id, name, phone, COALESCE(city, 'Kasur'), address, branch_id, 'both'
FROM public.customers
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  city = EXCLUDED.city;

-- 3. Synchronize existing suppliers into customers
INSERT INTO public.customers (id, name, phone, city, address, branch_id, party_type)
SELECT id, name, phone, city, address, branch_id, 'both'
FROM public.suppliers
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  city = EXCLUDED.city;

-- 4. Bidirectional Sync Trigger for Party Entities
CREATE OR REPLACE FUNCTION public.sync_party_entities()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_TABLE_NAME = 'customers') THEN
    INSERT INTO public.suppliers (id, name, phone, city, address, branch_id, party_type)
    VALUES (NEW.id, NEW.name, NEW.phone, NEW.city, NEW.address, NEW.branch_id, COALESCE(NEW.party_type, 'both'))
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      party_type = EXCLUDED.party_type;
  ELSIF (TG_TABLE_NAME = 'suppliers') THEN
    INSERT INTO public.customers (id, name, phone, city, address, branch_id, party_type)
    VALUES (NEW.id, NEW.name, NEW.phone, NEW.city, NEW.address, NEW.branch_id, COALESCE(NEW.party_type, 'both'))
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      party_type = EXCLUDED.party_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_customer_to_supplier ON public.customers;
CREATE TRIGGER trg_sync_customer_to_supplier
AFTER INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_party_entities();

DROP TRIGGER IF EXISTS trg_sync_supplier_to_customer ON public.suppliers;
CREATE TRIGGER trg_sync_supplier_to_customer
AFTER INSERT OR UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.sync_party_entities();
