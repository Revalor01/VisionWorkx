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
export type AppRevisionKind =
  | "create"    // the initial generation
  | "change"    // a plain-English edit request
  | "rollback"; // redeploy of an earlier revision's snapshot
export type AppRevisionStatus =
  | "queued"    // request accepted, not yet picked up
  | "building"  // edit + deploy in progress
  | "deployed"  // live
  | "failed";
export type PaymentsStatus =
  | "none"      // Connect onboarding not started
  | "pending"   // account created, Stripe still needs details
  | "active";   // charges_enabled — the app can take payments
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";
export type AutomationOperation = "INSERT" | "UPDATE" | "DELETE";
export type BlogProductSlug = "visionworkx" | "chorebit" | "feelflow" | "mindbit" | "sanctum";
export type BlogPostStatus = "draft" | "published";
export type LeadStatus = "new" | "contacted" | "responded" | "qualified" | "converted" | "dead";
export type LeadLanguage = "en" | "es";

export type MarketingProduct = "visionworkx" | "chorebit" | "feelflow" | "mindbit" | "sanctum";
export type MarketingCampaignStatus =
  | "draft"
  | "scheduled"
  | "generated"
  | "pending_review"
  | "sending"
  | "sent"
  | "failed"
  | "canceled";
export type MarketingAutonomy = "manual" | "auto";
export type MarketingRecurrence = "weekly" | "monthly";
export type MarketingChannel = "email" | "push" | "sms";

export type ContentSourceType = "blog" | "announcement" | "update";
export type ContentItemStatus = "draft" | "ready" | "archived";
export type ContentTopicCadence = "weekly" | "monthly" | "on_demand";
export type ContentDerivativeChannel = "blog" | "social" | "email" | "push" | "sms";
export type ContentDerivativeStatus = "pending" | "generated" | "pending_review" | "approved" | "published" | "failed";

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

export type SocialPlatform = "facebook" | "instagram" | "tiktok" | "youtube";
export type SocialVideoStatus = "raw" | "in_editing" | "ready" | "posted" | "generating" | "failed";
export type SocialContentStatus = "draft" | "approved" | "scheduled" | "posted" | "failed";
export type SocialInboxSourceType = "dm" | "comment";
export type SocialInboxClassification = "auto_answered" | "requires_human";
export type SocialInboxStatus = "open" | "resolved";
export type SocialAutonomyMode = "manual" | "semi_autonomous" | "fully_autonomous";
export type SocialRiskLevel = "low" | "medium" | "high";
export type SocialContentGeneratedBy = "manual" | "autonomous" | "content_engine";
export type SocialAutonomyFlagKind = "banned_word" | "high_risk" | "publish_failure" | "inbox_escalation";
export type LinkedInPostStatus = "draft" | "approved" | "posted";

export interface LeadSignal {
  tier: 1 | 2 | 3 | 4;
  label: string;
  points: number;
  detection: "auto" | "api" | "manual" | "scrape" | "inferred";
}

export type PartnerIndustry =
  | "health_wellness"
  | "home_services_trades"
  | "food_beverage"
  | "fitness"
  | "professional_services"
  | "automotive"
  | "retail"
  | "other";
export type PartnerBudgetRange = "under_500" | "500_1500" | "1500_5000" | "5000_plus";
export type PartnerSocialReachRange = "under_500" | "500_2500" | "2500_10000" | "10000_50000" | "50000_plus";
export type PartnerReferralNetworkSize = "0_5" | "6_15" | "16_40" | "41_plus";
export type PartnerTier = "tier_1" | "tier_2" | "tier_3";
export type PartnerStatus = "pending" | "approved" | "denied";

export interface PartnerScoreSignal {
  dimension: "industry_fit" | "promotional_reach" | "budget_alignment" | "project_complexity" | "referral_potential";
  label: string;
  points: number;
}

export type PartnerReferralStatus = "submitted" | "contacted" | "converted" | "declined";

export interface AgreementTerms {
  tier: PartnerTier;
  tierLabel: string;
  discountPercentage: number;
  businessName: string;
  requiredPromotionalActions: string[];
  referralExpectations: string;
  scopeNote: string;
  timeline: string;
  paymentStructure: string;
  generatedAt: string;
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
      sms_opt_ins: {
        Row: {
          id: string;
          user_id: string;
          phone: string;
          consented_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone: string;
          consented_at?: string;
          updated_at?: string;
        };
        Update: {
          phone?: string;
          updated_at?: string;
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
          stripe_connect_account_id: string | null;
          payments_status: PaymentsStatus;
          checkout_secret: string | null;
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
          stripe_connect_account_id?: string | null;
          payments_status?: PaymentsStatus;
          checkout_secret?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: AppCategory;
          status?: AppStatus;
          intake_data?: IntakeData | null;
          generated_code?: string | null;
          deploy_url?: string | null;
          stripe_connect_account_id?: string | null;
          payments_status?: PaymentsStatus;
          checkout_secret?: string | null;
        };
        Relationships: [];
      };
      app_metrics: {
        Row: {
          id: string;
          app_id: string;
          user_id: string;
          day: string;
          metric_key: string;
          value: number;
          captured_at: string;
        };
        Insert: {
          id?: string;
          app_id: string;
          user_id: string;
          day: string;
          metric_key: string;
          value?: number;
          captured_at?: string;
        };
        Update: {
          value?: number;
          captured_at?: string;
        };
        Relationships: [];
      };
      app_revisions: {
        Row: {
          id: string;
          app_id: string;
          user_id: string;
          kind: AppRevisionKind;
          status: AppRevisionStatus;
          request_text: string | null;
          changelog: string | null;
          file_snapshot: Record<string, string>;
          changed_files: string[];
          error: string | null;
          preview_url: string | null;
          created_at: string;
          deployed_at: string | null;
        };
        Insert: {
          id?: string;
          app_id: string;
          user_id: string;
          kind?: AppRevisionKind;
          status?: AppRevisionStatus;
          request_text?: string | null;
          changelog?: string | null;
          file_snapshot?: Record<string, string>;
          changed_files?: string[];
          error?: string | null;
          preview_url?: string | null;
          created_at?: string;
          deployed_at?: string | null;
        };
        Update: {
          kind?: AppRevisionKind;
          status?: AppRevisionStatus;
          request_text?: string | null;
          changelog?: string | null;
          file_snapshot?: Record<string, string>;
          changed_files?: string[];
          error?: string | null;
          preview_url?: string | null;
          deployed_at?: string | null;
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
      automation_usage: {
        Row: {
          id: string;
          user_id: string;
          period: string;
          sent_count: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          period: string;
          sent_count?: number;
          updated_at?: string;
        };
        Update: {
          sent_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      blog_keywords: {
        Row: {
          id: string;
          product: BlogProductSlug;
          keyword: string;
          volume: number | null;
          difficulty: number | null;
          cpc: number | null;
          source: string;
          used: boolean;
          discovered_at: string;
        };
        Insert: {
          id?: string;
          product: BlogProductSlug;
          keyword: string;
          volume?: number | null;
          difficulty?: number | null;
          cpc?: number | null;
          source?: string;
          used?: boolean;
          discovered_at?: string;
        };
        Update: {
          used?: boolean;
        };
        Relationships: [];
      };
      blog_posts: {
        Row: {
          id: string;
          product: BlogProductSlug;
          keyword: string;
          title: string;
          slug: string;
          meta_description: string | null;
          excerpt: string | null;
          body: string;
          faqs: { question: string; answer: string }[];
          tags: string[];
          seo_score: number | null;
          status: BlogPostStatus;
          auto_published: boolean;
          created_at: string;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          product: BlogProductSlug;
          keyword: string;
          title: string;
          slug: string;
          meta_description?: string | null;
          excerpt?: string | null;
          body: string;
          faqs?: { question: string; answer: string }[];
          tags?: string[];
          seo_score?: number | null;
          status?: BlogPostStatus;
          auto_published?: boolean;
          created_at?: string;
          published_at?: string | null;
        };
        Update: {
          title?: string;
          meta_description?: string | null;
          excerpt?: string | null;
          body?: string;
          faqs?: { question: string; answer: string }[];
          tags?: string[];
          seo_score?: number | null;
          status?: BlogPostStatus;
          published_at?: string | null;
        };
        Relationships: [];
      };
      blog_run_log: {
        Row: {
          id: string;
          run_at: string;
          status: string;
          summary: string | null;
        };
        Insert: {
          id?: string;
          run_at?: string;
          status: string;
          summary?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      ai_usage_log: {
        Row: {
          id: string;
          source: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd?: number | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      blog_product_config: {
        Row: {
          product: BlogProductSlug;
          autonomy_mode: "manual" | "semi_autonomous" | "fully_autonomous";
          banned_words: string[];
          autonomy_paused_at: string | null;
          autonomy_paused_reason: string | null;
          updated_at: string;
        };
        Insert: {
          product: BlogProductSlug;
          autonomy_mode?: "manual" | "semi_autonomous" | "fully_autonomous";
          banned_words?: string[];
          autonomy_paused_at?: string | null;
          autonomy_paused_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          autonomy_mode?: "manual" | "semi_autonomous" | "fully_autonomous";
          banned_words?: string[];
          autonomy_paused_at?: string | null;
          autonomy_paused_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      blog_autonomy_flags: {
        Row: {
          id: string;
          product: BlogProductSlug;
          post_id: string | null;
          kind: "banned_word";
          detail: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          product: BlogProductSlug;
          post_id?: string | null;
          kind: "banned_word";
          detail: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      weekly_recaps: {
        Row: {
          id: string;
          week_start: string;
          stats: Record<string, unknown>;
          script: string | null;
          video_prompt: string | null;
          video_path: string | null;
          status: "draft" | "video_ready";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          stats: Record<string, unknown>;
          script?: string | null;
          video_prompt?: string | null;
          video_path?: string | null;
          status?: "draft" | "video_ready";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          stats?: Record<string, unknown>;
          script?: string | null;
          video_prompt?: string | null;
          video_path?: string | null;
          status?: "draft" | "video_ready";
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_campaigns: {
        Row: {
          id: string;
          product: MarketingProduct;
          subject: string;
          body_html: string;
          status: MarketingCampaignStatus;
          recipient_count: number;
          sent_count: number;
          failed_count: number;
          created_at: string;
          updated_at: string;
          sent_at: string | null;
          goal: string | null;
          voice_notes: string | null;
          autonomy: MarketingAutonomy;
          run_at: string | null;
          canceled_at: string | null;
          recurring_schedule_id: string | null;
          target_emails: string[] | null;
          channel: MarketingChannel;
        };
        Insert: {
          id?: string;
          product: MarketingProduct;
          subject: string;
          body_html: string;
          status?: MarketingCampaignStatus;
          recipient_count?: number;
          sent_count?: number;
          failed_count?: number;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
          goal?: string | null;
          voice_notes?: string | null;
          autonomy?: MarketingAutonomy;
          run_at?: string | null;
          canceled_at?: string | null;
          recurring_schedule_id?: string | null;
          target_emails?: string[] | null;
          channel?: MarketingChannel;
        };
        Update: {
          subject?: string;
          body_html?: string;
          status?: MarketingCampaignStatus;
          recipient_count?: number;
          sent_count?: number;
          failed_count?: number;
          updated_at?: string;
          sent_at?: string | null;
          goal?: string | null;
          voice_notes?: string | null;
          autonomy?: MarketingAutonomy;
          run_at?: string | null;
          canceled_at?: string | null;
          recurring_schedule_id?: string | null;
          target_emails?: string[] | null;
          channel?: MarketingChannel;
        };
        Relationships: [];
      };
      marketing_recurring_schedules: {
        Row: {
          id: string;
          product: MarketingProduct;
          goal: string;
          voice_notes: string | null;
          recurrence: MarketingRecurrence;
          day_of_week: number | null;
          day_of_month: number | null;
          hour_utc: number;
          autonomy: MarketingAutonomy;
          active: boolean;
          next_run_at: string;
          created_at: string;
          updated_at: string;
          channel: MarketingChannel;
        };
        Insert: {
          id?: string;
          product: MarketingProduct;
          goal: string;
          voice_notes?: string | null;
          recurrence: MarketingRecurrence;
          day_of_week?: number | null;
          day_of_month?: number | null;
          hour_utc: number;
          autonomy?: MarketingAutonomy;
          active?: boolean;
          next_run_at: string;
          created_at?: string;
          updated_at?: string;
          channel?: MarketingChannel;
        };
        Update: {
          goal?: string;
          voice_notes?: string | null;
          recurrence?: MarketingRecurrence;
          day_of_week?: number | null;
          day_of_month?: number | null;
          hour_utc?: number;
          autonomy?: MarketingAutonomy;
          active?: boolean;
          next_run_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_unsubscribes: {
        Row: {
          id: string;
          product: MarketingProduct;
          email: string;
          unsubscribed_at: string;
        };
        Insert: {
          id?: string;
          product: MarketingProduct;
          email: string;
          unsubscribed_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      lifecycle_trigger_settings: {
        Row: {
          trigger_id: string;
          active: boolean;
          autonomy: MarketingAutonomy;
          updated_at: string;
        };
        Insert: {
          trigger_id: string;
          active?: boolean;
          autonomy?: MarketingAutonomy;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          autonomy?: MarketingAutonomy;
          updated_at?: string;
        };
        Relationships: [];
      };
      lifecycle_fires: {
        Row: {
          id: string;
          trigger_id: string;
          product: MarketingProduct;
          channel: MarketingChannel;
          recipient: string;
          campaign_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trigger_id: string;
          product: MarketingProduct;
          channel?: MarketingChannel;
          recipient: string;
          campaign_id?: string | null;
          created_at?: string;
        };
        Update: {
          campaign_id?: string | null;
        };
        Relationships: [];
      };
      mobile_sms_opt_outs: {
        Row: {
          id: string;
          phone: string;
          opted_out_at: string;
          source: "reply_stop" | "manual";
        };
        Insert: {
          id?: string;
          phone: string;
          opted_out_at?: string;
          source?: "reply_stop" | "manual";
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      content_items: {
        Row: {
          id: string;
          product: MarketingProduct;
          source_type: ContentSourceType;
          title: string;
          body: string;
          keyword_cluster: string[];
          status: ContentItemStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product: MarketingProduct;
          source_type?: ContentSourceType;
          title: string;
          body: string;
          keyword_cluster?: string[];
          status?: ContentItemStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          body?: string;
          keyword_cluster?: string[];
          status?: ContentItemStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      content_topics: {
        Row: {
          id: string;
          product: MarketingProduct;
          topic: string;
          keyword_cluster: string[];
          cadence: ContentTopicCadence;
          day_of_week: number | null;
          day_of_month: number | null;
          hour_utc: number;
          social_brand_id: string | null;
          active: boolean;
          next_run_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product: MarketingProduct;
          topic: string;
          keyword_cluster?: string[];
          cadence?: ContentTopicCadence;
          day_of_week?: number | null;
          day_of_month?: number | null;
          hour_utc?: number;
          social_brand_id?: string | null;
          active?: boolean;
          next_run_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          topic?: string;
          keyword_cluster?: string[];
          cadence?: ContentTopicCadence;
          day_of_week?: number | null;
          day_of_month?: number | null;
          hour_utc?: number;
          social_brand_id?: string | null;
          active?: boolean;
          next_run_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      content_derivatives: {
        Row: {
          id: string;
          content_item_id: string;
          channel: ContentDerivativeChannel;
          platform: SocialPlatform | null;
          autonomy: MarketingAutonomy;
          status: ContentDerivativeStatus;
          subject: string | null;
          body: string | null;
          blog_post_id: string | null;
          social_content_id: string | null;
          marketing_campaign_id: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content_item_id: string;
          channel: ContentDerivativeChannel;
          platform?: SocialPlatform | null;
          autonomy?: MarketingAutonomy;
          status?: ContentDerivativeStatus;
          subject?: string | null;
          body?: string | null;
          blog_post_id?: string | null;
          social_content_id?: string | null;
          marketing_campaign_id?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: ContentDerivativeStatus;
          subject?: string | null;
          body?: string | null;
          blog_post_id?: string | null;
          social_content_id?: string | null;
          marketing_campaign_id?: string | null;
          error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      dev_activity_log: {
        Row: {
          id: string;
          created_at: string;
          machine: string;
          summary: string;
          branch: string | null;
          commit_sha: string | null;
          version: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          machine: string;
          summary: string;
          branch?: string | null;
          commit_sha?: string | null;
          version?: string | null;
        };
        Update: Record<string, never>;
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
      social_brands: {
        Row: {
          id: string;
          name: string;
          slug: string;
          voice_notes: string | null;
          faq_document: string | null;
          fb_page_id: string | null;
          ig_business_id: string | null;
          website_url: string | null;
          tiktok_open_id: string | null;
          tiktok_username: string | null;
          socialapi_account_id: string | null;
          socialapi_tiktok_account_id: string | null;
          socialapi_youtube_account_id: string | null;
          socialapi_facebook_account_id: string | null;
          socialapi_brand_id: string | null;
          autonomy_enabled: boolean;
          autonomy_mode: SocialAutonomyMode;
          banned_words: string[];
          content_topics: string[];
          posting_frequency_per_day: number;
          autonomy_paused_at: string | null;
          autonomy_paused_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          voice_notes?: string | null;
          faq_document?: string | null;
          fb_page_id?: string | null;
          ig_business_id?: string | null;
          website_url?: string | null;
          tiktok_open_id?: string | null;
          tiktok_username?: string | null;
          socialapi_account_id?: string | null;
          socialapi_tiktok_account_id?: string | null;
          socialapi_youtube_account_id?: string | null;
          socialapi_facebook_account_id?: string | null;
          socialapi_brand_id?: string | null;
          autonomy_enabled?: boolean;
          autonomy_mode?: SocialAutonomyMode;
          banned_words?: string[];
          content_topics?: string[];
          posting_frequency_per_day?: number;
          autonomy_paused_at?: string | null;
          autonomy_paused_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          voice_notes?: string | null;
          faq_document?: string | null;
          fb_page_id?: string | null;
          ig_business_id?: string | null;
          website_url?: string | null;
          tiktok_open_id?: string | null;
          tiktok_username?: string | null;
          socialapi_account_id?: string | null;
          socialapi_tiktok_account_id?: string | null;
          socialapi_youtube_account_id?: string | null;
          socialapi_facebook_account_id?: string | null;
          socialapi_brand_id?: string | null;
          autonomy_enabled?: boolean;
          autonomy_mode?: SocialAutonomyMode;
          banned_words?: string[];
          content_topics?: string[];
          posting_frequency_per_day?: number;
          autonomy_paused_at?: string | null;
          autonomy_paused_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_connections: {
        Row: {
          id: string;
          brand_id: string;
          fb_page_access_token: string;
          token_expires_at: string | null;
          connected_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          fb_page_access_token: string;
          token_expires_at?: string | null;
          connected_at?: string;
        };
        Update: {
          fb_page_access_token?: string;
          token_expires_at?: string | null;
        };
        Relationships: [];
      };
      social_tiktok_connections: {
        Row: {
          id: string;
          brand_id: string;
          access_token: string;
          refresh_token: string;
          access_token_expires_at: string;
          connected_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          access_token: string;
          refresh_token: string;
          access_token_expires_at: string;
          connected_at?: string;
        };
        Update: {
          access_token?: string;
          refresh_token?: string;
          access_token_expires_at?: string;
        };
        Relationships: [];
      };
      social_tiktok_oauth_sessions: {
        Row: {
          id: string;
          brand_id: string;
          code_verifier: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          code_verifier: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      social_video_assets: {
        Row: {
          id: string;
          brand_id: string;
          status: SocialVideoStatus;
          raw_path: string;
          final_path: string | null;
          editor_email: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          status?: SocialVideoStatus;
          raw_path: string;
          final_path?: string | null;
          editor_email?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: SocialVideoStatus;
          final_path?: string | null;
          editor_email?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_content: {
        Row: {
          id: string;
          brand_id: string;
          video_asset_id: string | null;
          image_path: string | null;
          platform: SocialPlatform;
          hook: string | null;
          caption: string;
          hashtags: string[];
          status: SocialContentStatus;
          scheduled_at: string | null;
          posted_at: string | null;
          platform_post_id: string | null;
          failure_reason: string | null;
          risk_level: SocialRiskLevel | null;
          generated_by: SocialContentGeneratedBy;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          video_asset_id?: string | null;
          image_path?: string | null;
          platform: SocialPlatform;
          hook?: string | null;
          caption: string;
          hashtags?: string[];
          status?: SocialContentStatus;
          scheduled_at?: string | null;
          risk_level?: SocialRiskLevel | null;
          generated_by?: SocialContentGeneratedBy;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          video_asset_id?: string | null;
          image_path?: string | null;
          hook?: string | null;
          caption?: string;
          hashtags?: string[];
          status?: SocialContentStatus;
          scheduled_at?: string | null;
          posted_at?: string | null;
          platform_post_id?: string | null;
          failure_reason?: string | null;
          risk_level?: SocialRiskLevel | null;
          generated_by?: SocialContentGeneratedBy;
          updated_at?: string;
        };
        Relationships: [];
      };
      linkedin_posts: {
        Row: {
          id: string;
          video_asset_id: string | null;
          hook: string | null;
          caption: string;
          hashtags: string[];
          status: LinkedInPostStatus;
          posted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_asset_id?: string | null;
          hook?: string | null;
          caption: string;
          hashtags?: string[];
          status?: LinkedInPostStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          video_asset_id?: string | null;
          hook?: string | null;
          caption?: string;
          hashtags?: string[];
          status?: LinkedInPostStatus;
          posted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_content_metrics: {
        Row: {
          id: string;
          social_content_id: string;
          captured_on: string;
          source: string;
          impressions: number | null;
          reach: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          saves: number | null;
          video_views: number | null;
          link_clicks: number | null;
          tracked_clicks: number | null;
          engagement_rate: number | null;
          raw: Record<string, unknown>;
          captured_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          social_content_id: string;
          captured_on?: string;
          source: string;
          impressions?: number | null;
          reach?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          saves?: number | null;
          video_views?: number | null;
          link_clicks?: number | null;
          tracked_clicks?: number | null;
          engagement_rate?: number | null;
          raw?: Record<string, unknown>;
          captured_at?: string;
          updated_at?: string;
        };
        Update: {
          source?: string;
          impressions?: number | null;
          reach?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          saves?: number | null;
          video_views?: number | null;
          link_clicks?: number | null;
          tracked_clicks?: number | null;
          engagement_rate?: number | null;
          raw?: Record<string, unknown>;
          updated_at?: string;
        };
        Relationships: [];
      };
      short_links: {
        Row: {
          id: string;
          code: string;
          destination_url: string;
          social_content_id: string | null;
          brand_id: string | null;
          platform: string | null;
          campaign: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          destination_url: string;
          social_content_id?: string | null;
          brand_id?: string | null;
          platform?: string | null;
          campaign?: string | null;
          created_at?: string;
        };
        Update: {
          destination_url?: string;
          social_content_id?: string | null;
          brand_id?: string | null;
          platform?: string | null;
          campaign?: string | null;
        };
        Relationships: [];
      };
      link_clicks: {
        Row: {
          id: string;
          short_link_id: string;
          clicked_at: string;
          referrer: string | null;
          user_agent: string | null;
          ip_hash: string | null;
          is_bot: boolean;
        };
        Insert: {
          id?: string;
          short_link_id: string;
          clicked_at?: string;
          referrer?: string | null;
          user_agent?: string | null;
          ip_hash?: string | null;
          is_bot?: boolean;
        };
        Update: {
          referrer?: string | null;
          user_agent?: string | null;
          ip_hash?: string | null;
          is_bot?: boolean;
        };
        Relationships: [];
      };
      social_autonomy_flags: {
        Row: {
          id: string;
          brand_id: string;
          content_id: string | null;
          kind: SocialAutonomyFlagKind;
          detail: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          brand_id: string;
          content_id?: string | null;
          kind: SocialAutonomyFlagKind;
          detail: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          content_id?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      social_inbox_items: {
        Row: {
          id: string;
          brand_id: string;
          platform: SocialPlatform;
          source_type: SocialInboxSourceType;
          sender_id: string;
          sender_name: string | null;
          message_text: string;
          classification: SocialInboxClassification;
          auto_reply_text: string | null;
          status: SocialInboxStatus;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          brand_id: string;
          platform: SocialPlatform;
          source_type: SocialInboxSourceType;
          sender_id: string;
          sender_name?: string | null;
          message_text: string;
          classification: SocialInboxClassification;
          auto_reply_text?: string | null;
          status?: SocialInboxStatus;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          status?: SocialInboxStatus;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      social_editors: {
        Row: {
          email: string;
          added_at: string;
        };
        Insert: {
          email: string;
          added_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      social_oauth_sessions: {
        Row: {
          id: string;
          brand_id: string;
          user_token: string;
          pages_json: { pageId: string; pageName: string; pageAccessToken: string; igBusinessId: string | null }[];
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          user_token: string;
          pages_json: { pageId: string; pageName: string; pageAccessToken: string; igBusinessId: string | null }[];
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      partner_applications: {
        Row: {
          id: string;
          business_name: string;
          owner_name: string;
          email: string;
          phone: string;
          industry: PartnerIndustry;
          services_offered: string[];
          services_offered_other: string | null;
          online_presence_url: string | null;
          budget_range: PartnerBudgetRange;
          social_reach_range: PartnerSocialReachRange;
          referral_network_size: PartnerReferralNetworkSize;
          why_partner: string;
          logo_path: string | null;
          photo_paths: string[];
          score_breakdown: PartnerScoreSignal[];
          total_score: number;
          tier: PartnerTier | null;
          discount_percentage: number | null;
          status: PartnerStatus;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          account_user_id: string | null;
          agreement_terms: AgreementTerms | null;
          agreement_generated_at: string | null;
          agreement_accepted_at: string | null;
          referral_code: string | null;
          completed_promotional_actions: string[];
          converted_referral_count: number;
          referral_bonus_discount_percentage: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_name: string;
          owner_name: string;
          email: string;
          phone: string;
          industry: PartnerIndustry;
          services_offered: string[];
          services_offered_other?: string | null;
          online_presence_url?: string | null;
          budget_range: PartnerBudgetRange;
          social_reach_range: PartnerSocialReachRange;
          referral_network_size: PartnerReferralNetworkSize;
          why_partner: string;
          logo_path?: string | null;
          photo_paths?: string[];
          score_breakdown?: PartnerScoreSignal[];
          total_score?: number;
          tier?: PartnerTier | null;
          discount_percentage?: number | null;
          status?: PartnerStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          account_user_id?: string | null;
          agreement_terms?: AgreementTerms | null;
          agreement_generated_at?: string | null;
          agreement_accepted_at?: string | null;
          referral_code?: string | null;
          completed_promotional_actions?: string[];
          converted_referral_count?: number;
          referral_bonus_discount_percentage?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: PartnerStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          account_user_id?: string | null;
          agreement_terms?: AgreementTerms | null;
          agreement_generated_at?: string | null;
          agreement_accepted_at?: string | null;
          referral_code?: string | null;
          completed_promotional_actions?: string[];
          converted_referral_count?: number;
          referral_bonus_discount_percentage?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_referrals: {
        Row: {
          id: string;
          partner_application_id: string;
          referred_business_name: string;
          referred_contact_name: string | null;
          referred_email: string | null;
          referred_phone: string | null;
          notes: string | null;
          status: PartnerReferralStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          partner_application_id: string;
          referred_business_name: string;
          referred_contact_name?: string | null;
          referred_email?: string | null;
          referred_phone?: string | null;
          notes?: string | null;
          status?: PartnerReferralStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: PartnerReferralStatus;
          updated_at?: string;
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
export type AppRevision = Database["public"]["Tables"]["app_revisions"]["Row"];
export type AppMetric = Database["public"]["Tables"]["app_metrics"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];
export type AutomationWorkflow = Database["public"]["Tables"]["automation_workflows"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadEvent = Database["public"]["Tables"]["lead_events"]["Row"];
export type PromoteBusiness = Database["public"]["Tables"]["promote_businesses"]["Row"];
export type PromoteCreative = Database["public"]["Tables"]["promote_creatives"]["Row"];
export type PromoteCampaign = Database["public"]["Tables"]["promote_campaigns"]["Row"];
export type PromoteSubscription = Database["public"]["Tables"]["promote_subscriptions"]["Row"];
export type SocialBrand = Database["public"]["Tables"]["social_brands"]["Row"];
export type SocialConnection = Database["public"]["Tables"]["social_connections"]["Row"];
export type SocialVideoAsset = Database["public"]["Tables"]["social_video_assets"]["Row"];
export type SocialContent = Database["public"]["Tables"]["social_content"]["Row"];
export type LinkedInPost = Database["public"]["Tables"]["linkedin_posts"]["Row"];
export type SocialContentMetrics = Database["public"]["Tables"]["social_content_metrics"]["Row"];
export type ShortLink = Database["public"]["Tables"]["short_links"]["Row"];
export type LinkClick = Database["public"]["Tables"]["link_clicks"]["Row"];
export type SocialInboxItem = Database["public"]["Tables"]["social_inbox_items"]["Row"];
export type SocialAutonomyFlag = Database["public"]["Tables"]["social_autonomy_flags"]["Row"];
export type PartnerApplication = Database["public"]["Tables"]["partner_applications"]["Row"];
export type PartnerReferral = Database["public"]["Tables"]["partner_referrals"]["Row"];
export type BlogPost = Database["public"]["Tables"]["blog_posts"]["Row"];
export type BlogKeyword = Database["public"]["Tables"]["blog_keywords"]["Row"];
export type BlogRunLogEntry = Database["public"]["Tables"]["blog_run_log"]["Row"];
export type WeeklyRecap = Database["public"]["Tables"]["weekly_recaps"]["Row"];
export type MarketingCampaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];
export type MarketingRecurringSchedule = Database["public"]["Tables"]["marketing_recurring_schedules"]["Row"];
export type MarketingUnsubscribe = Database["public"]["Tables"]["marketing_unsubscribes"]["Row"];
export type LifecycleTriggerSettingsRow = Database["public"]["Tables"]["lifecycle_trigger_settings"]["Row"];
export type LifecycleFireRow = Database["public"]["Tables"]["lifecycle_fires"]["Row"];
export type MobileSmsOptOut = Database["public"]["Tables"]["mobile_sms_opt_outs"]["Row"];
export type ContentItem = Database["public"]["Tables"]["content_items"]["Row"];
export type ContentTopic = Database["public"]["Tables"]["content_topics"]["Row"];
export type ContentDerivative = Database["public"]["Tables"]["content_derivatives"]["Row"];
export type SmsOptIn = Database["public"]["Tables"]["sms_opt_ins"]["Row"];
export type DevActivityLogEntry = Database["public"]["Tables"]["dev_activity_log"]["Row"];
