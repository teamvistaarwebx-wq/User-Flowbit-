import type { AutomationAction } from './types'
import type { Recipe } from './recipes'

/**
 * Hindi wording for the ready recipes (notifications-v2 §3: "English and
 * Hindi"). REVIEW: a first draft for the owner to check before it is
 * offered as the default; keep it short and natural, and keep every
 * {{variable}} exactly as in English (recipes-hi.test.ts checks them).
 *
 * Keyed by recipe and by the index of the action in the recipe; actions
 * without an entry keep the English text. A workspace picks Hindi in the
 * editor ("Use Hindi wording"), which fills the fields before it saves.
 */

export const HINDI_STATUS = 'review' as const

export type HindiText = Readonly<{ subject?: string; body: string }>

const SIGN_OFF = '\n\nधन्यवाद,\n{{business_name}}'

export const RECIPE_HINDI: Readonly<Record<string, Readonly<Record<number, HindiText>>>> = {
  payment_thank_you: {
    0: { subject: '{{amount}} का भुगतान मिल गया, धन्यवाद', body: 'नमस्ते {{client_name}},\n\nइनवॉइस {{invoice_number}} के लिए {{amount}} का भुगतान {{payment_date}} को मिल गया है। अब इस पर कुछ बाकी नहीं है।\n\nआपकी रसीद {{receipt_number}}: {{receipt_link}}' + SIGN_OFF },
  },
  part_payment_ack: {
    0: { subject: '{{invoice_number}} के लिए {{amount}} मिले', body: 'नमस्ते {{client_name}},\n\nधन्यवाद। इनवॉइस {{invoice_number}} के लिए {{amount}} मिल गए हैं। इस पर अभी {{balance_due}} बाकी है।\n\nआपकी रसीद {{receipt_number}}: {{receipt_link}}' + SIGN_OFF },
  },
  invoice_send: {
    0: { subject: '{{business_name}} की ओर से इनवॉइस {{invoice_number}}', body: 'नमस्ते {{client_name}},\n\n{{invoice_total}} का इनवॉइस {{invoice_number}} तैयार है। भुगतान की आख़िरी तारीख़: {{due_date}}।\n\nदेखें, डाउनलोड करें या भुगतान करें: {{document_link}}' + SIGN_OFF },
  },
  quote_follow_up: {
    0: { subject: 'कोटेशन {{quote_number}} के बारे में', body: 'नमस्ते {{client_name}},\n\n{{quote_total}} के हमारे कोटेशन {{quote_number}} पर आपकी राय जानना चाहते थे। आप इसे एक क्लिक में ऑनलाइन स्वीकार कर सकते हैं: {{document_link}}\n\nकोई सवाल हो तो बताइए।' + SIGN_OFF },
  },
  quote_expiring: {
    0: { subject: 'कोटेशन {{quote_number}} {{valid_until}} तक मान्य है', body: 'नमस्ते {{client_name}},\n\nयाद दिला दें कि {{quote_total}} का हमारा कोटेशन {{quote_number}} {{valid_until}} तक मान्य है। ऑनलाइन स्वीकार करें: {{document_link}}' + SIGN_OFF },
  },
  monthly_statement: {
    0: { subject: '{{business_name}} की ओर से आपका स्टेटमेंट', body: 'नमस्ते {{client_name}},\n\nआज आपके खाते पर {{total_due}} बाकी है। इनवॉइस के हिसाब से पूरा स्टेटमेंट: {{statement_link}}' + SIGN_OFF },
  },
  new_lead: {
    1: { subject: '{{business_name}} से संपर्क करने के लिए धन्यवाद', body: 'नमस्ते {{lead_name}},\n\nआपकी पूछताछ के लिए धन्यवाद। हमारी टीम से {{assignee_name}} जल्द ही आपसे बात करेंगे।' + SIGN_OFF },
  },
  attendance_nudge: {
    0: { subject: 'आज आपने अभी तक चेक-इन नहीं किया', body: 'Flowbit (या WhatsApp बॉट) से चेक-इन करें। कहीं और से काम कर रहे हों तो सुधार का अनुरोध भेजें।' },
  },
  checkout_nudge: {
    0: { subject: 'क्या आप चेक-आउट करना भूल गए?', body: 'आपने {{checked_in_at}} पर चेक-इन किया था। चेक-आउट करें ताकि आपके घंटे गिने जाएँ।' },
  },
  birthday_wish: {
    0: { subject: 'जन्मदिन मुबारक हो, {{employee_name}}!', body: '{{business_name}} की पूरी टीम की ओर से आने वाले साल के लिए ढेरों शुभकामनाएँ।' },
    1: { subject: 'आज {{employee_name}} का जन्मदिन है', body: 'उन्हें शुभकामनाएँ भेजें!' },
  },
  anniversary_wish: {
    0: { subject: 'काम के {{years}} साल पूरे होने पर बधाई, {{employee_name}}!', body: '{{business_name}} में आपके हर योगदान के लिए धन्यवाद।' },
    1: { subject: '{{employee_name}} ने आज {{years}} साल पूरे किए', body: 'उन्हें बधाई दें!' },
  },
  new_joiner_welcome: {
    0: { subject: '{{business_name}} में आपका स्वागत है, {{employee_name}}!', body: 'नमस्ते {{employee_name}},\n\nहमें ख़ुशी है कि आप {{join_date}} को हमसे जुड़ रहे हैं। पहले दिन {{manager_name}} आपसे मिलेंगे।\n\nकृपया अपना PAN, बैंक विवरण और जॉइनिंग के दस्तावेज़ साथ रखें।' + SIGN_OFF },
  },
  onboarding_docs_reminder: {
    0: { subject: 'जॉइनिंग के कुछ दस्तावेज़ अभी बाकी हैं', body: 'नमस्ते {{employee_name}},\n\nआपकी जॉइनिंग चेकलिस्ट {{checklist_percent}}% पूरी है। अभी चाहिए: {{missing_items}}। इन्हें Flowbit में My profile में अपलोड करें, या HR को भेजें।' + SIGN_OFF },
  },
  payslip_ready_note: {
    0: { subject: 'आपकी {{month}} की सैलरी स्लिप तैयार है', body: 'यह आपके ईमेल में और Flowbit में My payslips में है।' },
  },
}

export type RecipeLanguage = 'en' | 'hi'

export const hasHindi = (recipeKey: string | null | undefined): boolean => Boolean(recipeKey && RECIPE_HINDI[recipeKey])

/** The recipe's actions in a language: Hindi text where there is some, English for the rest; channel, recipient and timing never change. */
export function recipeActions(recipe: Pick<Recipe, 'key' | 'spec'>, language: RecipeLanguage = 'en'): AutomationAction[] {
  const hindi = language === 'hi' ? RECIPE_HINDI[recipe.key] : undefined
  return recipe.spec.actions.map((action, i) => {
    const text = hindi?.[i]
    return text ? { ...action, body: text.body, ...(text.subject ? { subject: text.subject } : {}) } : { ...action }
  })
}
