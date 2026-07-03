export type Plan = "free" | "starter" | "growth" | "pro";
export type AppCategory = "booking" | "crm" | "inventory" | "portal";
export type AppStatus =
  | "generating"    // Claude API call in progress
  | "ready"         // code saved, awaiting deployment
  | "deploying"     // Vercel build queued / building
  | "deployed"      // live at deploy_url
  | "failed"        // generation failed
  | "deploy_failed"; // Vercel deployment failed
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";

export interface IntakeData {
  businessName: string;
  businessType: string;
  location: string;
  description?: string;
  category: AppCategory;
  features: string[];
  primaryColor: string;
  font: string;
  logoPath?: string;
}

// Supabase Database generic — must include Relationships in every table to satisfy GenericTable.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          company_name: string | null;
          plan: Plan;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          company_name?: string | null;
          plan?: Plan;
          created_at?: string;
        };
        Update: {
          full_name?: string | null;
          company_name?: string | null;
          plan?: Plan;
        };
        Relationships: [];
      };
      apps: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: AppCategory;
          status: AppStatus;
          intake_data: IntakeData | null;
          generated_code: string | null;
          deploy_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category: AppCategory;
          status?: AppStatus;
          intake_data?: IntakeData | null;
          generated_code?: string | null;
          deploy_url?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: AppCategory;
          status?: AppStatus;
          intake_data?: IntakeData | null;
          generated_code?: string | null;
          deploy_url?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan: Exclude<Plan, "free"> | null;
          status: SubscriptionStatus | null;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan?: Exclude<Plan, "free"> | null;
          status?: SubscriptionStatus | null;
          current_period_end?: string | null;
          created_at?: string;
        };
        Update: {
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan?: Exclude<Plan, "free"> | null;
          status?: SubscriptionStatus | null;
          current_period_end?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// Convenience row types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type App = Database["public"]["Tables"]["apps"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
