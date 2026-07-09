export type Plan = "free" | "starter" | "growth" | "pro";
export type AppCategory =
  | "booking"
  | "crm"
  | "inventory"
  | "portal"
  | "invoicing"
  | "membership";
export type AppStatus =
  | "generating"    // Claude API call in progress
  | "ready"         // code saved, awaiting deployment
  | "deploying"     // Vercel build queued / building
  | "deployed"      // live at deploy_url
  | "failed"        // generation failed
  | "deploy_failed"; // Vercel deployment failed
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";
export type AutomationOperation = "INSERT" | "UPDATE" | "DELETE";
export type LeadStatus = "new" | "contacted" | "responded" | "qualified" | "converted" | "dead";
export type LeadLanguage = "en" | "es";

export type PromotePlan = "starter" | "growth" | "pro";
export type PromoteCreativeFormat = "1080x1080" | "1080x1920" | "1200x628";
export type PromoteCreativeStatus = "draft" | "approved" | "archived";
export type PromoteCampaignPlatform = "meta" | "google" | "both";
export type PromoteCampaignObjective = "awareness" | "traffic" | "leads" | "conversions";
export type PromoteCampaignStatus = "draft" | "pending_platform_approval" | "paused" | "completed";

export interface PromoteService {
  name: string;
  price: number;
  duration: number;
}

export interface PromoteTargetAudience {
  ageMin: number;
  ageMax: number;
  genders: ("all" | "men" | "women")[];
  interests: string[];
  radius: number;
  location: string;
}

export interface LeadSignal {
  tier: 1 | 2 | 3 | 4;
  label: string;
  points: number;
  detection: "auto" | "api" | "manual" | "scrape" | "inferred";
}

export interface IntakeData {
  businessName: string;
  businessType: string;
  location: string;
  description?: string;
  category: AppCategory;
  features: string[];
  primaryColor: string;
  backgroundColor?: string;
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
      automation_events: {
        Row: {
          id: string;
          app_id: string;
          schema_name: string;
          table_name: string;
          operation: AutomationOperation;
          row_data: Record<string, unknown>;
          old_row_data: Record<string, unknown> | null;
          created_at: string;
          delivered_at: string | null;
        };
        Insert: {
          id?: string;
          app_id: string;
          schema_name: string;
          table_name: string;
          operation: AutomationOperation;
          row_data: Record<string, unknown>;
          old_row_data?: Record<string, unknown> | null;
          created_at?: string;
          delivered_at?: string | null;
        };
        Update: {
          delivered_at?: string | null;
        };
        Relationships: [];
      };
      automation_workflows: {
        Row: {
          id: string;
          app_id: string;
          trigger_type: string;
          action_type: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          app_id: string;
          trigger_type: string;
          action_type: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          source: string;
          source_id: string;
          business_name: string;
          business_type: string | null;
          industry_category: string | null;
          address: string | null;
          lat: number | null;
          lng: number | null;
          distance_miles: number | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          has_facebook_only: boolean;
          opening_hours: string | null;
          detected_language: LeadLanguage;
          yelp_id: string | null;
          yelp_rating: number | null;
          yelp_review_count: number | null;
          yelp_review_excerpts: string[];
          raw_score: number;
          industry_multiplier: number;
          final_score: number;
          signal_breakdown: LeadSignal[];
          status: LeadStatus;
          discovered_at: string;
          last_contacted_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source?: string;
          source_id: string;
          business_name: string;
          business_type?: string | null;
          industry_category?: string | null;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          distance_miles?: number | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          has_facebook_only?: boolean;
          opening_hours?: string | null;
          detected_language?: LeadLanguage;
          yelp_id?: string | null;
          yelp_rating?: number | null;
          yelp_review_count?: number | null;
          yelp_review_excerpts?: string[];
          raw_score?: number;
          industry_multiplier?: number;
          final_score?: number;
          signal_breakdown?: LeadSignal[];
          status?: LeadStatus;
          discovered_at?: string;
          last_contacted_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          business_type?: string | null;
          industry_category?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          has_facebook_only?: boolean;
          opening_hours?: string | null;
          detected_language?: LeadLanguage;
          distance_miles?: number | null;
          yelp_id?: string | null;
          yelp_rating?: number | null;
          yelp_review_count?: number | null;
          yelp_review_excerpts?: string[];
          raw_score?: number;
          industry_multiplier?: number;
          final_score?: number;
          signal_breakdown?: LeadSignal[];
          status?: LeadStatus;
          last_contacted_at?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_events: {
        Row: {
          id: string;
          lead_id: string;
          event_type: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          event_type: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          notes?: string | null;
        };
        Relationships: [];
      };
      promote_businesses: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          business_type: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          zip_code: string | null;
          description: string | null;
          logo_url: string | null;
          photo_urls: string[];
          services: PromoteService[];
          brand_color: string;
          booking_url: string | null;
          website_url: string | null;
          meta_ad_account_id: string | null;
          meta_access_token: string | null;
          google_customer_id: string | null;
          google_refresh_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          business_type: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          description?: string | null;
          logo_url?: string | null;
          photo_urls?: string[];
          services?: PromoteService[];
          brand_color?: string;
          booking_url?: string | null;
          website_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          business_type?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          description?: string | null;
          logo_url?: string | null;
          photo_urls?: string[];
          services?: PromoteService[];
          brand_color?: string;
          booking_url?: string | null;
          website_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promote_creatives: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          headline: string;
          body_text: string;
          cta: string;
          script: string | null;
          image_url: string;
          template_id: string;
          format: PromoteCreativeFormat;
          status: PromoteCreativeStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          headline: string;
          body_text: string;
          cta: string;
          script?: string | null;
          image_url: string;
          template_id: string;
          format?: PromoteCreativeFormat;
          status?: PromoteCreativeStatus;
          created_at?: string;
        };
        Update: {
          status?: PromoteCreativeStatus;
        };
        Relationships: [];
      };
      promote_campaigns: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          platform: PromoteCampaignPlatform;
          objective: PromoteCampaignObjective;
          status: PromoteCampaignStatus;
          daily_budget: number;
          total_budget: number | null;
          start_date: string;
          end_date: string | null;
          target_audience: PromoteTargetAudience;
          meta_campaign_id: string | null;
          google_campaign_id: string | null;
          total_spend: number;
          impressions: number;
          clicks: number;
          conversions: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          platform: PromoteCampaignPlatform;
          objective: PromoteCampaignObjective;
          status?: PromoteCampaignStatus;
          daily_budget: number;
          total_budget?: number | null;
          start_date: string;
          end_date?: string | null;
          target_audience?: PromoteTargetAudience;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          status?: PromoteCampaignStatus;
          daily_budget?: number;
          total_budget?: number | null;
          end_date?: string | null;
          target_audience?: PromoteTargetAudience;
          updated_at?: string;
        };
        Relationships: [];
      };
      promote_campaign_creatives: {
        Row: {
          campaign_id: string;
          creative_id: string;
        };
        Insert: {
          campaign_id: string;
          creative_id: string;
        };
        Update: {
          campaign_id?: string;
          creative_id?: string;
        };
        Relationships: [];
      };
      promote_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan: PromotePlan | null;
          status: SubscriptionStatus | null;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan?: PromotePlan | null;
          status?: SubscriptionStatus | null;
          current_period_end?: string | null;
          created_at?: string;
        };
        Update: {
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan?: PromotePlan | null;
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
export type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];
export type AutomationWorkflow = Database["public"]["Tables"]["automation_workflows"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadEvent = Database["public"]["Tables"]["lead_events"]["Row"];
export type PromoteBusiness = Database["public"]["Tables"]["promote_businesses"]["Row"];
export type PromoteCreative = Database["public"]["Tables"]["promote_creatives"]["Row"];
export type PromoteCampaign = Database["public"]["Tables"]["promote_campaigns"]["Row"];
export type PromoteSubscription = Database["public"]["Tables"]["promote_subscriptions"]["Row"];
