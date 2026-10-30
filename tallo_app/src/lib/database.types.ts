
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "contacts": {
                  Row: {
                    "archived_at": string | null,"color": string,"created_at": string,"id": string,"invite_code": string | null,"linked_user_id": string | null,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"color"?: string,"created_at"?: string,"id"?: string,"invite_code"?: string | null,"linked_user_id"?: string | null,"name": string,"owner_id"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string,"created_at"?: string,"id"?: string,"invite_code"?: string | null,"linked_user_id"?: string | null,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_linked_user_id_fkey"
      columns: ["linked_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_linked_user_id_fkey"
      columns: ["linked_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_accounts": {
                  Row: {
                    "archived_at": string | null,"color": string | null,"created_at": string,"due_day": number | null,"id": string,"installment_amount": number | null,"kind": Database["public"]['Enums']["item_kind"],"name": string,"owner_id": string,"provider": string | null,"statement_day": number | null,"total_installments": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"color"?: string | null,"created_at"?: string,"due_day"?: number | null,"id"?: string,"installment_amount"?: number | null,"kind": Database["public"]['Enums']["item_kind"],"name": string,"owner_id"?: string,"provider"?: string | null,"statement_day"?: number | null,"total_installments"?: number | null
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string | null,"created_at"?: string,"due_day"?: number | null,"id"?: string,"installment_amount"?: number | null,"kind"?: Database["public"]['Enums']["item_kind"],"name"?: string,"owner_id"?: string,"provider"?: string | null,"statement_day"?: number | null,"total_installments"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_accounts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_accounts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "amount": number | null,"category": Database["public"]['Enums']["expense_cat"] | null,"created_at": string,"debt_account_id": string | null,"done_at": string | null,"due_date": string | null,"id": string,"installment_no": number | null,"kind": Database["public"]['Enums']["item_kind"],"month_id": string,"name": string,"note": string | null,"owner_id": string,"paid_amount": number | null,"position": number,"recurring": boolean,"source_request_id": string | null,"status": Database["public"]['Enums']["item_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"category"?: Database["public"]['Enums']["expense_cat"] | null,"created_at"?: string,"debt_account_id"?: string | null,"done_at"?: string | null,"due_date"?: string | null,"id"?: string,"installment_no"?: number | null,"kind": Database["public"]['Enums']["item_kind"],"month_id": string,"name": string,"note"?: string | null,"owner_id"?: string,"paid_amount"?: number | null,"position"?: number,"recurring"?: boolean,"source_request_id"?: string | null,"status"?: Database["public"]['Enums']["item_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number | null,"category"?: Database["public"]['Enums']["expense_cat"] | null,"created_at"?: string,"debt_account_id"?: string | null,"done_at"?: string | null,"due_date"?: string | null,"id"?: string,"installment_no"?: number | null,"kind"?: Database["public"]['Enums']["item_kind"],"month_id"?: string,"name"?: string,"note"?: string | null,"owner_id"?: string,"paid_amount"?: number | null,"position"?: number,"recurring"?: boolean,"source_request_id"?: string | null,"status"?: Database["public"]['Enums']["item_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_debt_account_id_fkey"
      columns: ["debt_account_id"]
isOneToOne: false
      referencedRelation: "debt_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "month_summaries"
      referencedColumns: ["month_id"]
    },{
      foreignKeyName: "items_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "months"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_source_request_fk"
      columns: ["source_request_id"]
isOneToOne: false
      referencedRelation: "payment_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"months": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"id": string,"month": number,"owner_id": string,"status": Database["public"]['Enums']["month_status"],"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"id"?: string,"month": number,"owner_id"?: string,"status"?: Database["public"]['Enums']["month_status"],"year": number
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"id"?: string,"month"?: number,"owner_id"?: string,"status"?: Database["public"]['Enums']["month_status"],"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "months_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "months_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"item_id": string | null,"read_at": string | null,"request_id": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"item_id"?: string | null,"read_at"?: string | null,"request_id"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"item_id"?: string | null,"read_at"?: string | null,"request_id"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_totals"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "notifications_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "payment_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offsets": {
                  Row: {
                    "amount": number,"contact_id": string,"created_at": string,"id": string,"month_id": string,"name": string,"note": string | null,"owner_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"contact_id": string,"created_at"?: string,"id"?: string,"month_id": string,"name": string,"note"?: string | null,"owner_id"?: string,"position"?: number
                  }
                  Update: {
                    "amount"?: number,"contact_id"?: string,"created_at"?: string,"id"?: string,"month_id"?: string,"name"?: string,"note"?: string | null,"owner_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "offsets_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offsets_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "month_summaries"
      referencedColumns: ["month_id"]
    },{
      foreignKeyName: "offsets_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "months"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offsets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offsets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_requests": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"id": string,"month": number,"paid_at": string | null,"received_at": string | null,"recipient_id": string,"recipient_item_id": string | null,"sender_contact_id": string,"sender_id": string,"sender_month_id": string,"sent_at": string | null,"status": Database["public"]['Enums']["request_status"],"total": number,"version": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"id"?: string,"month": number,"paid_at"?: string | null,"received_at"?: string | null,"recipient_id": string,"recipient_item_id"?: string | null,"sender_contact_id": string,"sender_id": string,"sender_month_id": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"total"?: number,"version"?: number,"year": number
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"id"?: string,"month"?: number,"paid_at"?: string | null,"received_at"?: string | null,"recipient_id"?: string,"recipient_item_id"?: string | null,"sender_contact_id"?: string,"sender_id"?: string,"sender_month_id"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"total"?: number,"version"?: number,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_requests_recipient_item_id_fkey"
      columns: ["recipient_item_id"]
isOneToOne: false
      referencedRelation: "item_totals"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "payment_requests_recipient_item_id_fkey"
      columns: ["recipient_item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_requests_sender_contact_id_fkey"
      columns: ["sender_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_requests_sender_month_id_fkey"
      columns: ["sender_month_id"]
isOneToOne: false
      referencedRelation: "month_summaries"
      referencedColumns: ["month_id"]
    },{
      foreignKeyName: "payment_requests_sender_month_id_fkey"
      columns: ["sender_month_id"]
isOneToOne: false
      referencedRelation: "months"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "color": string,"created_at": string,"display_name": string,"due_remind_days": number,"friend_code": string,"id": string,"notify_prefs": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"display_name": string,"due_remind_days"?: number,"friend_code": string,"id": string,"notify_prefs"?: NonNullable<Json>
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"display_name"?: string,"due_remind_days"?: number,"friend_code"?: string,"id"?: string,"notify_prefs"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"request_events": {
                  Row: {
                    "actor_id": string,"created_at": string,"id": string,"line_id": string | null,"message": string | null,"request_id": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"id"?: string,"line_id"?: string | null,"message"?: string | null,"request_id": string,"type": string
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"id"?: string,"line_id"?: string | null,"message"?: string | null,"request_id"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "request_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "payment_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"request_lines": {
                  Row: {
                    "amount": number,"group_label": string | null,"id": string,"kind": string,"label": string,"position": number,"request_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"group_label"?: string | null,"id"?: string,"kind": string,"label": string,"position": number,"request_id": string,"version": number
                  }
                  Update: {
                    "amount"?: number,"group_label"?: string | null,"id"?: string,"kind"?: string,"label"?: string,"position"?: number,"request_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_lines_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "payment_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "amount": number,"contact_id": string,"id": string,"month_id": string,"owner_id": string,"settled_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"contact_id": string,"id"?: string,"month_id": string,"owner_id"?: string,"settled_at"?: string
                  }
                  Update: {
                    "amount"?: number,"contact_id"?: string,"id"?: string,"month_id"?: string,"owner_id"?: string,"settled_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "month_summaries"
      referencedColumns: ["month_id"]
    },{
      foreignKeyName: "settlements_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "months"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"shares": {
                  Row: {
                    "amount": number,"contact_id": string,"fixed_amount": number | null,"id": string,"month_id": string,"owner_id": string,"rule_id": string,"weight": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number,"contact_id": string,"fixed_amount"?: number | null,"id"?: string,"month_id": string,"owner_id": string,"rule_id": string,"weight"?: number | null
                  }
                  Update: {
                    "amount"?: number,"contact_id"?: string,"fixed_amount"?: number | null,"id"?: string,"month_id"?: string,"owner_id"?: string,"rule_id"?: string,"weight"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shares_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shares_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "month_summaries"
      referencedColumns: ["month_id"]
    },{
      foreignKeyName: "shares_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "months"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shares_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shares_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shares_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "split_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"split_rules": {
                  Row: {
                    "created_at": string,"id": string,"include_me": boolean,"item_id": string,"mode": Database["public"]['Enums']["split_mode"],"month_id": string,"my_weight": number | null,"owner_id": string,"recurring": boolean,"sub_item_id": string | null,"split_target": number | null
                  }
                  ComputedFields: "split_target"
                  Insert: {
                    "created_at"?: string,"id"?: string,"include_me"?: boolean,"item_id": string,"mode": Database["public"]['Enums']["split_mode"],"month_id": string,"my_weight"?: number | null,"owner_id": string,"recurring"?: boolean,"sub_item_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"include_me"?: boolean,"item_id"?: string,"mode"?: Database["public"]['Enums']["split_mode"],"month_id"?: string,"my_weight"?: number | null,"owner_id"?: string,"recurring"?: boolean,"sub_item_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "split_rules_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_totals"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "split_rules_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "split_rules_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "month_summaries"
      referencedColumns: ["month_id"]
    },{
      foreignKeyName: "split_rules_month_id_fkey"
      columns: ["month_id"]
isOneToOne: false
      referencedRelation: "months"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "split_rules_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "split_rules_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "split_rules_sub_item_id_fkey"
      columns: ["sub_item_id"]
isOneToOne: false
      referencedRelation: "sub_items"
      referencedColumns: ["id"]
    }
                  ]
                },"sub_items": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"item_id": string,"name": string,"note": string | null,"occurred_on": string | null,"owner_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"item_id": string,"name": string,"note"?: string | null,"occurred_on"?: string | null,"owner_id"?: string,"position"?: number
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"item_id"?: string,"name"?: string,"note"?: string | null,"occurred_on"?: string | null,"owner_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sub_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "item_totals"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "sub_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sub_items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sub_items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "item_totals": {
                  Row: {
                    "item_id": string | null,"sub_total": number | null,"unallocated": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"month_person_balances": {
                  Row: {
                    "contact_id": string | null,"month_id": string | null,"net": number | null,"offset_total": number | null,"receivable": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"month_summaries": {
                  Row: {
                    "balance": number | null,"balance_actual": number | null,"done_count": number | null,"expense_total": number | null,"from_people": number | null,"income_own": number | null,"missing_count": number | null,"month": number | null,"month_id": string | null,"savings_total": number | null,"status": Database["public"]['Enums']["month_status"] | null,"to_people": number | null,"total_count": number | null,"year": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_profiles": {
                  Row: {
                    "color": string | null,"display_name": string | null,"id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "color"?: string | null,"display_name"?: string | null,"id"?: string | null
                         }
                        Update: {
                           "color"?: string | null,"display_name"?: string | null,"id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_contact_invite":
{ Args: { "p_code": string,"p_my_contact_id"?: string }; Returns: {
              "archived_at": string | null,
"color": string,
"created_at": string,
"id": string,
"invite_code": string | null,
"linked_user_id": string | null,
"name": string,
"owner_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "contacts"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_split":
{ Args: { "p_include_me"?: boolean,"p_mode": Database["public"]['Enums']["split_mode"],"p_my_weight"?: number,"p_parts": Json,"p_recurring"?: boolean,"p_targets": Json }; Returns: {
              "created_at": string,
"id": string,
"include_me": boolean,
"item_id": string,
"mode": Database["public"]['Enums']["split_mode"],
"month_id": string,
"my_weight": number | null,
"owner_id": string,
"recurring": boolean,
"sub_item_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "split_rules"
        isOneToOne: false
        isSetofReturn: true
      } },
"can_see_request":
{ Args: { "p_request_id": string }; Returns: boolean
                           },
"cancel_request":
{ Args: { "p_request_id": string }; Returns: {
              "accepted_at": string | null,
"created_at": string,
"id": string,
"month": number,
"paid_at": string | null,
"received_at": string | null,
"recipient_id": string,
"recipient_item_id": string | null,
"sender_contact_id": string,
"sender_id": string,
"sender_month_id": string,
"sent_at": string | null,
"status": Database["public"]['Enums']["request_status"],
"total": number,
"version": number,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "payment_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"clear_split":
{ Args: { "p_item_id": string,"p_sub_item_id"?: string }; Returns: undefined
                           },
"comment_request":
{ Args: { "p_is_question"?: boolean,"p_line_id"?: string,"p_message": string,"p_request_id": string }; Returns: {
              "actor_id": string,
"created_at": string,
"id": string,
"line_id": string | null,
"message": string | null,
"request_id": string,
"type": string
            }
                          SetofOptions: {
        from: "*"
        to: "request_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"contact_invite_code":
{ Args: { "p_contact_id": string }; Returns: string
                           },
"create_due_notifications":
{ Args: { "p_today"?: string }; Returns: number
                           },
"create_month":
{ Args: { "p_copy_from"?: string,"p_copy_item_ids"?: (string)[],"p_month": number,"p_year": number }; Returns: {
              "closed_at": string | null,
"created_at": string,
"id": string,
"month": number,
"owner_id": string,
"status": Database["public"]['Enums']["month_status"],
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "months"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_contact":
{ Args: { "p_contact_id": string,"p_force"?: boolean }; Returns: undefined
                           },
"generate_friend_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"lock_request":
{ Args: { "p_allowed": (Database["public"]['Enums']["request_status"])[],"p_request_id": string,"p_role": string }; Returns: {
              "accepted_at": string | null,
"created_at": string,
"id": string,
"month": number,
"paid_at": string | null,
"received_at": string | null,
"recipient_id": string,
"recipient_item_id": string | null,
"sender_contact_id": string,
"sender_id": string,
"sender_month_id": string,
"sent_at": string | null,
"status": Database["public"]['Enums']["request_status"],
"total": number,
"version": number,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "payment_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"month_copy_candidates":
{ Args: { "p_month_id": string }; Returns: {
              "item_id": string,"suggested": boolean
            }[]
                           },
"month_is_closed":
{ Args: { "p_month_id": string }; Returns: boolean
                           },
"notify":
{ Args: { "p_actor_id": string,"p_data"?: Json,"p_item_id": string,"p_request_id": string,"p_type": string,"p_user_id": string }; Returns: undefined
                           },
"peek_contact_invite":
{ Args: { "p_code": string }; Returns: {
              "inviter_color": string,"inviter_name": string
            }[]
                           },
"recompute_split":
{ Args: { "p_rule_id": string }; Returns: undefined
                           },
"send_request":
{ Args: { "p_contact_id": string,"p_month_id": string,"p_note"?: string }; Returns: {
              "accepted_at": string | null,
"created_at": string,
"id": string,
"month": number,
"paid_at": string | null,
"received_at": string | null,
"recipient_id": string,
"recipient_item_id": string | null,
"sender_contact_id": string,
"sender_id": string,
"sender_month_id": string,
"sent_at": string | null,
"status": Database["public"]['Enums']["request_status"],
"total": number,
"version": number,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "payment_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_month_status":
{ Args: { "p_month_id": string,"p_status": Database["public"]['Enums']["month_status"] }; Returns: {
              "closed_at": string | null,
"created_at": string,
"id": string,
"month": number,
"owner_id": string,
"status": Database["public"]['Enums']["month_status"],
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "months"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_split":
{ Args: { "p_include_me"?: boolean,"p_item_id": string,"p_mode": Database["public"]['Enums']["split_mode"],"p_my_weight"?: number,"p_parts": Json,"p_recurring"?: boolean,"p_sub_item_id": string }; Returns: {
              "created_at": string,
"id": string,
"include_me": boolean,
"item_id": string,
"mode": Database["public"]['Enums']["split_mode"],
"month_id": string,
"my_weight": number | null,
"owner_id": string,
"recurring": boolean,
"sub_item_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "split_rules"
        isOneToOne: true
        isSetofReturn: false
      } },
"split_target":
{ Args: { "p_rule": Omit<Database["public"]['Tables']["split_rules"]['Row'], Database["public"]['Tables']["split_rules"]['ComputedFields']> }; Returns: number
                           },
"unlink_contact":
{ Args: { "p_contact_id": string }; Returns: {
              "archived_at": string | null,
"color": string,
"created_at": string,
"id": string,
"invite_code": string | null,
"linked_user_id": string | null,
"name": string,
"owner_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "contacts"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "expense_cat": "spending"|"subscription"|"savings"|"pay_person","item_kind": "card"|"loan"|"expense"|"income","item_status": "pending"|"done","month_status": "draft"|"active"|"closed","request_status": "draft"|"sent"|"questioned"|"accepted"|"paid"|"received"|"cancelled","split_mode": "equal"|"ratio"|"fixed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "expense_cat": ["spending", "subscription", "savings", "pay_person"],"item_kind": ["card", "loan", "expense", "income"],"item_status": ["pending", "done"],"month_status": ["draft", "active", "closed"],"request_status": ["draft", "sent", "questioned", "accepted", "paid", "received", "cancelled"],"split_mode": ["equal", "ratio", "fixed"]
          }
        }
} as const
