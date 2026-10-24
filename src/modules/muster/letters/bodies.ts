/**
 * The shipped wording of each letter. HR edits every letter before issuing it,
 * and can rewrite a template in Letters → Templates. Bodies name the person,
 * never pronouns. Placeholders are listed in render.ts.
 */
export const BODIES: Record<string, { subject: string; body: string }> = {
  internship_offer: {
    subject: 'Internship Offer — {{employee.designation}}',
    body: `Dear {{employee.name}},

We are pleased to offer you an internship with {{company.name}} as {{employee.designation}} in the {{employee.department}} team.

Your internship will begin on {{input.effectiveDate}} and run for {{input.durationMonths}} months. You will report to {{employee.manager}}.

A monthly stipend of ₹{{input.stipend}} will be payable, subject to the usual deductions.

This internship is a learning engagement and does not constitute an offer of employment. We look forward to having you with us.

{{comments.hr}}`,
  },

  internship_completion: {
    subject: 'Internship Completion — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

This is to certify that {{employee.name}} ({{employee.code}}) has successfully completed an internship with {{company.name}} as {{employee.designation}} in the {{employee.department}} team.

The internship ran from {{employee.dateOfJoining}} to {{employee.dateOfExit}}, a period of {{employee.duration}}, under the supervision of {{employee.manager}}.

During this period {{employee.name}} worked on the following:

{{work.undertaken}}

{{comments.performance}}

We wish {{employee.name}} every success.

{{comments.hr}}`,
  },

  internship_certificate: {
    subject: 'Certificate of Internship',
    body: `CERTIFICATE OF INTERNSHIP

This is to certify that

{{employee.name}}

has completed an internship with {{company.name}} as {{employee.designation}}, from {{employee.dateOfJoining}} to {{employee.dateOfExit}} ({{employee.duration}}).

Work undertaken: {{work.undertaken}}

Issued on {{letter.issueDate}}.

{{comments.hr}}`,
  },

  internship_experience: {
    subject: 'Internship Experience Letter — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

This is to certify that {{employee.name}} ({{employee.code}}) interned with {{company.name}} as {{employee.designation}} in the {{employee.department}} team from {{employee.dateOfJoining}} to {{employee.dateOfExit}}, a period of {{employee.duration}}.

Work undertaken during the internship:

{{work.undertaken}}

Performance:

{{comments.performance}}

Reporting manager's assessment:

{{comments.manager}}

We found {{employee.name}} to be sincere and willing to learn, and we wish them well in their future endeavours.

{{comments.hr}}`,
  },

  internship_recommendation: {
    subject: 'Letter of Recommendation — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

I write in support of {{employee.name}}, who interned with {{company.name}} as {{employee.designation}} from {{employee.dateOfJoining}} to {{employee.dateOfExit}}.

During the internship {{employee.name}} worked on:

{{work.undertaken}}

{{comments.recommendation}}

{{comments.manager}}

I recommend {{employee.name}} without reservation and am happy to answer any questions.`,
  },

  recommendation: {
    subject: 'Letter of Recommendation — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

I am pleased to recommend {{employee.name}}, who worked with {{company.name}} as {{employee.designation}} from {{employee.dateOfJoining}} to {{employee.dateOfExit}}.

{{work.undertaken}}

{{comments.recommendation}}

{{comments.manager}}

I recommend {{employee.name}} and would be glad to provide further detail.`,
  },

  employee_offer: {
    subject: 'Offer of Employment — {{employee.designation}}',
    body: `Dear {{employee.name}},

Further to our discussions, we are pleased to offer you the position of {{employee.designation}} in the {{employee.department}} team at {{company.name}}.

Your date of joining will be {{input.effectiveDate}}, and you will report to {{employee.manager}}.

Your annual cost to company will be ₹{{salary.ctcAnnual}}. A detailed breakdown of your compensation is provided separately.

This offer is subject to satisfactory verification of your documents and references.

Please confirm your acceptance by signing and returning a copy of this letter.

{{comments.hr}}`,
  },

  appointment: {
    subject: 'Letter of Appointment — {{employee.name}}',
    body: `Dear {{employee.name}},

With reference to your acceptance of our offer, we are pleased to confirm your appointment as {{employee.designation}} in the {{employee.department}} team at {{company.name}}, with effect from {{input.effectiveDate}}.

You will report to {{employee.manager}}. Your employment is governed by the company's policies as amended from time to time.

Your annual cost to company is ₹{{salary.ctcAnnual}}.

We welcome you to {{company.name}} and look forward to working with you.

{{comments.hr}}`,
  },

  confirmation: {
    subject: 'Confirmation of Employment — {{employee.name}}',
    body: `Dear {{employee.name}},

We are pleased to inform you that, following a review of your performance during the probation period, your services with {{company.name}} stand confirmed with effect from {{input.effectiveDate}}.

You continue in the role of {{employee.designation}} in the {{employee.department}} team.

{{comments.performance}}

{{comments.manager}}

Congratulations, and thank you for your contribution.`,
  },

  experience: {
    subject: 'Experience Letter — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

This is to certify that {{employee.name}} ({{employee.code}}) was employed with {{company.name}} as {{employee.designation}} in the {{employee.department}} team from {{employee.dateOfJoining}} to {{employee.dateOfExit}}, a period of {{employee.duration}}.

{{work.undertaken}}

During this period we found {{employee.name}} to be diligent and professional in conduct.

We wish {{employee.name}} every success in their future endeavours.

{{comments.hr}}`,
  },

  salary_revision: {
    subject: 'Revision of Compensation — {{employee.name}}',
    body: `Dear {{employee.name}},

We are pleased to inform you that your compensation has been revised with effect from {{input.effectiveDate}}.

Your revised annual cost to company will be ₹{{input.revisedCtc}}.

All other terms and conditions of your employment remain unchanged.

Thank you for your continued contribution to {{company.name}}.

{{comments.hr}}`,
  },

  promotion: {
    subject: 'Promotion — {{employee.name}}',
    body: `Dear {{employee.name}},

In recognition of your performance and contribution, we are pleased to promote you to the position of {{input.newDesignation}}, with effect from {{input.effectiveDate}}.

Your revised annual cost to company will be ₹{{input.revisedCtc}}.

{{comments.manager}}

Congratulations. We look forward to your continued contribution to {{company.name}}.`,
  },

  warning: {
    subject: 'Warning Letter — {{employee.name}}',
    body: `Dear {{employee.name}},

This letter is a formal warning regarding the following:

{{input.incident}}

This conduct is not in keeping with the standards expected at {{company.name}}.

Going forward, the following is expected:

{{input.expectation}}

Please treat this as serious. A repetition may lead to further action, including termination of employment.

A copy of this letter will be placed on your personnel record.

{{comments.hr}}`,
  },

  show_cause: {
    subject: 'Show Cause Notice — {{employee.name}}',
    body: `Dear {{employee.name}},

It has come to our attention that:

{{input.incident}}

You are hereby required to show cause, in writing, why disciplinary action should not be taken against you in this matter.

Your written explanation must reach the undersigned on or before {{input.respondBy}}.

Should no explanation be received by that date, the company will proceed on the basis of the information available to it.`,
  },

  termination: {
    subject: 'Termination of Employment — {{employee.name}}',
    body: `Dear {{employee.name}},

This is to inform you that your employment with {{company.name}} stands terminated with effect from {{input.effectiveDate}}.

Grounds:

{{input.groundsForTermination}}

You are required to return all company property and complete the clearance formalities. Your full and final settlement will be processed in accordance with company policy and applicable law.

{{comments.hr}}`,
  },

  resignation_acceptance: {
    subject: 'Acceptance of Resignation — {{employee.name}}',
    body: `Dear {{employee.name}},

We acknowledge receipt of your resignation dated {{input.resignationDate}} from the position of {{employee.designation}}.

Your resignation is accepted, and your last working day with {{company.name}} will be {{input.lastWorkingDay}}.

Please ensure a proper handover of your responsibilities and completion of the exit formalities before that date.

We thank you for your contribution and wish you well.

{{comments.hr}}`,
  },

  relieving: {
    subject: 'Relieving Letter — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

This is to certify that {{employee.name}} ({{employee.code}}) was employed with {{company.name}} as {{employee.designation}} from {{employee.dateOfJoining}} to {{input.lastWorkingDay}}.

{{employee.name}} has been relieved of all duties and responsibilities with effect from the close of business on {{input.lastWorkingDay}}, and has completed the exit formalities including the handover of company property.

We wish {{employee.name}} every success in their future endeavours.

{{comments.hr}}`,
  },

  full_and_final: {
    subject: 'Full and Final Settlement — {{employee.name}}',
    body: `Dear {{employee.name}},

This is to confirm that your full and final settlement with {{company.name}} has been processed.

A net amount of ₹{{input.settlementAmount}} was settled on {{input.settlementDate}}.

Breakdown:

{{input.settlementBreakdown}}

This settlement is in full and final discharge of all dues payable to you by the company.

Please retain this letter for your records.`,
  },

  no_dues: {
    subject: 'No Dues Certificate — {{employee.name}}',
    body: `TO WHOMSOEVER IT MAY CONCERN

This is to certify that {{employee.name}} ({{employee.code}}), who was associated with {{company.name}} as {{employee.designation}} until {{input.lastWorkingDay}}, has no dues outstanding against them.

All company property, including equipment and access credentials, has been returned, and all advances and dues have been settled.

This certificate is issued on request.

{{comments.hr}}`,
  },

  custom: {
    subject: '{{input.subject}}',
    body: `Dear {{employee.name}},

{{comments.hr}}`,
  },
}
