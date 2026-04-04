// Fixed target columns for leads table
// These appear in the column mapping dropdown
export const TARGET_FIELDS = [
  { value: "full_name", label: "Full Name" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "job_title", label: "Job Title" },
  { value: "email", label: "Email" },
  { value: "linkedin_url", label: "LinkedIn" },
  { value: "phone", label: "Phone Number" },
  { value: "company_name", label: "Company Name" },
  { value: "company_website", label: "Website / Domain" },
  { value: "company_linkedin", label: "Company LinkedIn" },
  { value: "company_facebook", label: "Company Facebook" },
  { value: "raw_company_address", label: "Company Address" },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["value"];
