import type { Lang } from './parse'

/** What the bot says, in English and Hindi (pure). Short lines: WhatsApp reads on a phone. */

type Copy = Readonly<{
  menu: (name: string) => string
  shareLocation: string
  locationNeeded: string
  checkedIn: (time: string) => string
  checkedOut: (time: string) => string
  noBalance: string
  balanceHead: string
  leaveTypes: (list: string) => string
  pickNumber: string
  askStart: string
  askEnd: string
  badDate: string
  endBeforeStart: string
  askReason: string
  reasonShort: string
  confirmLeave: (summary: string) => string
  leaveCancelled: string
  noPayslip: string
  payslipReady: (month: string, url: string) => string
  cancelled: string
  notLinked: string
  failed: (why: string) => string
  askUtr: string
  utrThanks: string
  badUtr: string
  askRejectNote: string
  openApp: string
}>

const EN: Copy = {
  menu: (name) => `Hi ${name}, reply with a number or a word:\n1 Check in\n2 Check out\n3 Leave balance\n4 Apply for leave\n5 Payslip link\nReply exit to stop at any step.`,
  shareLocation: 'To check in, share your current location: tap 📎 (or +) → Location → Send your current location.',
  locationNeeded: 'Please share your location to check in, or reply exit.',
  checkedIn: (time) => `Checked in at ${time}. Have a good day!`,
  checkedOut: (time) => `Checked out at ${time}. See you tomorrow.`,
  noBalance: 'No leave balances are set up for you yet. Ask HR.',
  balanceHead: 'Your leave balance:',
  leaveTypes: (list) => `Which leave? Reply with the number:\n${list}`,
  pickNumber: 'Reply with one of the numbers above, or exit.',
  askStart: 'From which date? (for example 12 Oct, 12/10 or tomorrow)',
  askEnd: 'Until which date? Reply same for one day.',
  badDate: 'I could not read that date. Try 12 Oct, 12/10 or tomorrow.',
  endBeforeStart: 'The last day cannot be before the first day. Until which date?',
  askReason: 'What is the reason? (a short line for your manager)',
  reasonShort: 'Please write a few words of reason.',
  confirmLeave: (summary) => `${summary}\nReply yes to apply, or no to cancel.`,
  leaveCancelled: 'Leave request not sent.',
  noPayslip: 'There is no payslip for you yet.',
  payslipReady: (month, url) => `Your payslip for ${month} is ready: ${url}\nFor your privacy, the page asks for a code sent to your work email.`,
  cancelled: 'Cancelled. Reply menu to see the options.',
  notLinked: 'Your account is not linked to an employee record. Ask HR to link it.',
  failed: (why) => `That did not go through: ${why}`,
  askUtr: 'Thanks! Please reply with the UTR or UPI reference number of your payment.',
  utrThanks: 'Thank you. We will confirm once the payment shows in our bank.',
  badUtr: 'A UTR or UPI reference is 6 to 30 letters and digits. Please send it again, or reply exit.',
  askRejectNote: 'Reply with the reason for rejecting, so they know why (or exit).',
  openApp: 'This button has expired. Open Flowbit to see the latest.',
}

const HI: Copy = {
  menu: (name) => `नमस्ते ${name}, नंबर या शब्द लिखकर भेजें:\n1 चेक इन\n2 चेक आउट\n3 छुट्टी बैलेंस\n4 छुट्टी के लिए आवेदन\n5 पेस्लिप लिंक\nकिसी भी समय रोकने के लिए रद्द लिखें।`,
  shareLocation: 'चेक इन के लिए अपनी लोकेशन भेजें: 📎 (या +) → Location → Send your current location.',
  locationNeeded: 'चेक इन के लिए कृपया लोकेशन भेजें, या रद्द लिखें।',
  checkedIn: (time) => `${time} पर चेक इन हो गया। आपका दिन अच्छा हो!`,
  checkedOut: (time) => `${time} पर चेक आउट हो गया। कल मिलते हैं।`,
  noBalance: 'आपके लिए अभी कोई छुट्टी बैलेंस सेट नहीं है। HR से पूछें।',
  balanceHead: 'आपका छुट्टी बैलेंस:',
  leaveTypes: (list) => `कौन सी छुट्टी? नंबर भेजें:\n${list}`,
  pickNumber: 'ऊपर दिए गए नंबरों में से एक भेजें, या रद्द लिखें।',
  askStart: 'किस तारीख से? (जैसे 12 Oct, 12/10 या कल)',
  askEnd: 'किस तारीख तक? एक दिन के लिए same लिखें।',
  badDate: 'तारीख समझ नहीं आई। 12 Oct, 12/10 या कल लिखें।',
  endBeforeStart: 'आखिरी दिन पहले दिन से पहले नहीं हो सकता। किस तारीख तक?',
  askReason: 'कारण क्या है? (मैनेजर के लिए एक छोटी लाइन)',
  reasonShort: 'कृपया कारण के कुछ शब्द लिखें।',
  confirmLeave: (summary) => `${summary}\nआवेदन के लिए हाँ लिखें, रद्द करने के लिए नहीं।`,
  leaveCancelled: 'छुट्टी का आवेदन नहीं भेजा गया।',
  noPayslip: 'आपकी कोई पेस्लिप अभी नहीं है।',
  payslipReady: (month, url) => `${month} की आपकी पेस्लिप तैयार है: ${url}\nआपकी प्राइवेसी के लिए, पेज आपके वर्क ईमेल पर भेजा गया कोड मांगेगा।`,
  cancelled: 'रद्द कर दिया। विकल्प देखने के लिए मेनू लिखें।',
  notLinked: 'आपका अकाउंट किसी कर्मचारी रिकॉर्ड से जुड़ा नहीं है। HR से जुड़वाएं।',
  failed: (why) => `यह नहीं हो पाया: ${why}`,
  askUtr: 'धन्यवाद! कृपया अपने भुगतान का UTR या UPI रेफरेंस नंबर भेजें।',
  utrThanks: 'धन्यवाद। बैंक में भुगतान दिखते ही हम पुष्टि करेंगे।',
  badUtr: 'UTR या UPI रेफरेंस 6 से 30 अक्षर और अंक का होता है। कृपया दोबारा भेजें, या रद्द लिखें।',
  askRejectNote: 'अस्वीकार करने का कारण लिखें, ताकि उन्हें पता चले (या रद्द लिखें)।',
  openApp: 'यह बटन पुराना हो गया है। ताज़ा जानकारी के लिए Flowbit खोलें।',
}

export const botCopy = (lang: Lang): Copy => (lang === 'hi' ? HI : EN)
