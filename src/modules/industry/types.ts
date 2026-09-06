import type { CustomFieldType, Priority } from "@prisma/client";

export interface OrderCategoryDefinition {
  key: string;
  label: string;
  /** Signalwörter, die der Klassifikation und den Prioritätsregeln dienen. */
  keywords: string[];
  defaultPriority: Priority;
  /** Planungsdauer in Minuten – Basis für die AI-Terminplanung (§13/§14). */
  estimatedMinutes: number;
  requiredSkills: string[];
}

export interface PriorityRuleDefinition {
  key: string;
  description: string;
  /** Regel greift, wenn eines dieser Wörter im Text vorkommt … */
  keywords?: string[];
  /** … oder wenn die erkannte Kategorie passt. */
  categories?: string[];
  priority: Priority;
}

export interface FieldDefinition {
  entityType: "customer" | "order" | "appointment";
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  aiHint?: string;
  isRequired?: boolean;
}

export interface EmailCategoryDefinition {
  key: string;
  label: string;
  color: string;
  aiHint: string;
}

export interface OrderStatusDefinition {
  key: string;
  label: string;
  color: string;
  isDefault?: boolean;
  isTerminal?: boolean;
}

export interface EmailTemplateDefinition {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export interface IndustryProfileDefinition {
  key: string;
  name: string;
  /** Sprachliche Anpassung der Oberfläche und der AI-Ausgaben. */
  terminology: Record<string, string>;
  orderCategories: OrderCategoryDefinition[];
  priorityRules: PriorityRuleDefinition[];
  fields: FieldDefinition[];
  emailCategories: EmailCategoryDefinition[];
  orderStatuses: OrderStatusDefinition[];
  emailTemplates: EmailTemplateDefinition[];
  /** Zusätzliche Hinweise, die in AI-Prompts eingebettet werden. */
  aiInstructions: string[];
}
