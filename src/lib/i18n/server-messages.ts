import type { ActionResult } from '@/lib/action-types'
import type { Locale } from './index'

/**
 * Hindi for the messages the employee self-service actions return (leave,
 * comp-off, attendance correction, My details, Ask HR). Server actions are
 * written in English; `action(..., { localise: true })` passes their result
 * through `localiseResult` for a member who chose Hindi (R2 18.2). Names,
 * dates and leave types inside a message stay as written, like the rest of
 * the Hindi screens. A message not listed here stays in English.
 */

type Pattern = { re: RegExp; hi: (m: RegExpMatchArray) => string }

const EXACT_HI: Readonly<Record<string, string>> = {
  'Your account is not linked to an employee record. Ask HR to link it.': 'आपका खाता किसी कर्मचारी रिकॉर्ड से जुड़ा नहीं है। HR से इसे जोड़ने को कहें।',
  'Leave can only be applied for people in the directory.': 'छुट्टी सिर्फ़ डायरेक्टरी में मौजूद लोगों के लिए ली जा सकती है।',
  'Choose a leave type from the list.': 'सूची से छुट्टी का प्रकार चुनें।',
  'Choose a leave type': 'छुट्टी का प्रकार चुनें',
  'Those dates overlap another leave request that is pending or approved.': 'ये तारीखें किसी दूसरी लंबित या मंज़ूर छुट्टी से टकराती हैं।',
  'Overlaps another request': 'दूसरी अर्ज़ी से टकराती है',
  'Only the applicant or HR can withdraw a pending request.': 'लंबित अर्ज़ी सिर्फ़ आवेदक या HR वापस ले सकते हैं।',
  'That request is already closed.': 'यह अर्ज़ी पहले ही बंद हो चुकी है।',
  'That request changed a moment ago. Refresh to see it.': 'यह अर्ज़ी अभी-अभी बदली है। देखने के लिए पेज रीफ़्रेश करें।',
  'That day has not happened yet.': 'वह दिन अभी आया नहीं है।',
  'In the future': 'आगे की तारीख',
  'That was a normal working day. Comp-off is for giving up a day that was already off.': 'वह सामान्य कामकाजी दिन था। कॉम्प-ऑफ़ छुट्टी वाले दिन काम करने पर मिलता है।',
  'A working day': 'कामकाजी दिन',
  'A comp-off is earned by work that was recorded, so mark the day first (check-in or an HR override).': 'कॉम्प-ऑफ़ दर्ज काम पर मिलता है, इसलिए पहले वह दिन दर्ज करें (चेक इन या HR से)।',
  'No work recorded': 'कोई काम दर्ज नहीं',
  'A comp-off has already been raised for that day.': 'उस दिन का कॉम्प-ऑफ़ पहले ही माँगा जा चुका है।',
  'Already raised': 'पहले ही माँगा',
  'Before joining': 'जॉइन करने से पहले',
  'You already have a correction waiting for that day.': 'उस दिन का एक सुधार पहले से फ़ैसले का इंतज़ार कर रहा है।',
  'Already requested': 'पहले ही माँगा',
  'Outside your employment': 'आपकी नौकरी की अवधि से बाहर',
  'Nobody in HR could be reached in Flowbit. Tell HR directly.': 'Flowbit में HR में किसी से संपर्क नहीं हो सका। HR को सीधे बताएँ।',
  'Nothing had changed, so your details are as they were.': 'कुछ नहीं बदला, आपकी जानकारी पहले जैसी है।',
  'Please correct the highlighted fields.': 'चिह्नित फ़ील्ड ठीक करें।',
  'Some fields need attention.': 'कुछ फ़ील्ड ठीक करने हैं।',
  'This field is required.': 'यह फ़ील्ड ज़रूरी है।',
  Required: 'ज़रूरी',
  'Something went wrong on our side. Please try again in a moment.': 'हमारी तरफ़ से कुछ गड़बड़ हुई। थोड़ी देर में फिर कोशिश करें।',
  'Your session has ended. Sign in again to continue.': 'आपका सेशन खत्म हो गया है। जारी रखने के लिए फिर से साइन इन करें।',
}

const PATTERNS: readonly Pattern[] = [
  {
    re: /^(.+?) requested: (.+), (\d+(?:\.\d+)?) days?, waiting for approval\.(?: (.+))?$/s,
    hi: (m) => `${m[1]} की अर्ज़ी भेजी गई: ${m[2]}, ${m[3]} दिन, मंज़ूरी का इंतज़ार है।${m[4] ? ` ${m[4]}` : ''}`,
  },
  { re: /^Leave request withdrawn: (.+), (.+)\.$/s, hi: (m) => `छुट्टी की अर्ज़ी वापस ली गई: ${m[1]}, ${m[2]}।` },
  {
    re: /^Comp-off of (\S+) day for (.+?) sent for approval\.(?: It lapses (\d+) days after the day worked\.)?$/s,
    hi: (m) => `${m[2]} का कॉम्प-ऑफ़ (${m[1]} दिन) मंज़ूरी के लिए भेजा गया।${m[3] ? ` काम वाले दिन के ${m[3]} दिन बाद यह खत्म हो जाएगा।` : ''}`,
  },
  { re: /^Correction requested for (.+)\. You are told when it is decided\.$/s, hi: (m) => `${m[1]} के लिए सुधार माँगा गया। फ़ैसला होने पर आपको बताया जाएगा।` },
  { re: /^You were not employed on (.+)\.$/s, hi: (m) => `${m[1]} को आप नौकरी में नहीं थे।` },
  {
    re: /^Sent to HR: your (.+?) should say "(.*)"\. They change it on your record and you see it here\.$/s,
    hi: (m) => `HR को भेजा गया: आपका ${m[1]} "${m[2]}" होना चाहिए। HR आपके रिकॉर्ड में बदलेगा और आपको यहाँ दिखेगा।`,
  },
  {
    re: /^Saved your (.+?)\.( Someone in HR or Finance will verify the new account before the next payroll run\.)?$/s,
    hi: (m) => `सहेजा गया: ${m[1]}।${m[2] ? ' अगले payroll से पहले HR या Finance नया खाता जाँचेगा।' : ''}`,
  },
]

/** One message in the member's language; unknown messages and English pass through unchanged. */
export function localiseMessage(text: string, locale: Locale): string {
  if (locale === 'en') return text
  const exact = EXACT_HI[text]
  if (exact) return exact
  for (const { re, hi } of PATTERNS) {
    const match = text.match(re)
    if (match) return hi(match)
  }
  return text
}

const localiseFields = (fields: Record<string, string>, locale: Locale): Record<string, string> =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, localiseMessage(value, locale)]))

/** A copy of an action result with its message, error and field errors in the member's language. */
export function localiseResult<T>(result: ActionResult<T>, locale: Locale): ActionResult<T> {
  if (locale === 'en') return result
  if (result.ok) return result.message ? { ...result, message: localiseMessage(result.message, locale) } : result
  return {
    ...result,
    error: localiseMessage(result.error, locale),
    ...(result.fieldErrors ? { fieldErrors: localiseFields(result.fieldErrors, locale) } : {}),
  }
}
