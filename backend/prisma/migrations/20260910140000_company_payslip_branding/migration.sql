-- Company payslip branding (logo, signature, website/tagline/address, signatory)
ALTER TABLE "companies" ADD COLUMN "tagline" VARCHAR(200);
ALTER TABLE "companies" ADD COLUMN "website" VARCHAR(150);
ALTER TABLE "companies" ADD COLUMN "address" TEXT;
ALTER TABLE "companies" ADD COLUMN "logo_url" VARCHAR(255);
ALTER TABLE "companies" ADD COLUMN "signatory_name" VARCHAR(150);
ALTER TABLE "companies" ADD COLUMN "signatory_designation" VARCHAR(150);
ALTER TABLE "companies" ADD COLUMN "signature_url" VARCHAR(255);