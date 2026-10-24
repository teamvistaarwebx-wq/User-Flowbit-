# Questions for the CA: Flowbit message credits and subscriptions

**Draft, 7 Oct 2026.** Send this to the CA as is, or turn it into an email.

**From:** Sanskaar Webx Services LLP (trade name / brand: Flowbit, useflowbit.com)

## Background

Flowbit is our SaaS product: tasks, HR and payroll, CRM, and billing software for Indian businesses. We plan to launch two things.

1. **Subscriptions.** These are monthly or yearly plans, charged per person at ₹149 a month plus GST. Payment is collected by Razorpay, through card, UPI Autopay or e-mandate. Customers can also pay by bank transfer or UPI against a due invoice.
2. **WhatsApp message credits.** A customer recharges a prepaid balance (a "wallet") with us through Razorpay. The packs are ₹500, ₹1,000, ₹2,500, ₹5,000 and ₹10,000. The balance is then drawn down for each WhatsApp message sent from our software on the customer's behalf.
   - **Our supplier for messaging:** Interakt (Jio Haptik), which is a Meta WhatsApp Business Solution Provider. Interakt charges us GST at 18% when we recharge our own Interakt wallet.
   - **The credits can only be used for messages sent through Flowbit.** They cannot be withdrawn as cash, transferred to another customer, or spent with any other merchant.
   - **Bonus credit:** bigger packs carry free bonus credit (5–12%).
   - **Free allowance:** each plan may also include a number of free messages every month.

## Questions

### A. GST on message credits

1. **SAC code.** Should we use one SAC for both the subscription and the message credits, or two different ones? Our options are 998314, 998315, 998319 and 998431.
   - *What the software does today (8 Oct, pending your answer):* recharge invoices print `FLOWBIT_WALLET_SAC`, which falls back to the subscription SAC (`FLOWBIT_SAC`) until set. They share the `FB/` series with subscription invoices (Q12). Bonus credit appears as a ₹0 line (Q3). Changing either is a setting, not code.
2. **When GST is charged.** Our plan is to raise a **tax invoice for the full recharge at the time of payment**, treating it as an advance for our own services and charging 18% GST then. Do you agree?
   - The alternative is a receipt voucher at recharge and a tax invoice as messages are used. We would rather avoid this, because it needs monthly usage invoices.
   - Notes we read: the voucher amendments under Notification 16/2025 (effective 1 Oct 2025) and Circular 243/37/2024-GST.
3. **Free credit.**
   - Bonus credit on a pack, and the monthly free messages in a plan, carry no separate charge. Are we right that no GST applies to them?
   - Should they be shown on the invoice as ₹0 lines, or left off the invoice entirely?
4. **Unused credit.**
   - If credits expire unused (we propose expiry 12 months after recharge), is any GST adjustment needed?
   - Since GST was already paid on the full recharge, can the expired value simply stay as income?
5. **Refunds.**
   - We plan to refund unused paid credit only in exceptional cases (for example duplicate payments, or if we stop the service), and only to the original payment method, against a GST credit note. Is that the correct treatment?
   - When is the deadline to issue such a credit note in a financial year?
6. **Input tax credit.** Can we take ITC on Interakt's GST invoices for our own wallet recharges, given that we resell messaging as part of our service?
7. **Customers without a GSTIN** (B2C or unregistered).
   - Place of supply: should it be based on the billing state they enter? Is anything else needed on the invoice?
   - Are there special rules for customers who are not businesses?

### B. RBI / payments

8. Our understanding is that closed credits like these (usable only for our own service, no cash-out, no transfer) are a **closed-system PPI**, which needs no RBI authorisation. Please confirm. Should the terms or the invoice say anything about this?
9. Razorpay will hold the money only until it is settled to us. Does anything change if we offer auto-recharge, that is, an automatic top-up when the balance falls low, through UPI Autopay or e-mandate?

### C. Subscriptions

10. **TDS.**
    - Business customers may deduct TDS on the subscription. Is it 2% for technical services (s.393(1) of the Income-tax Act 2025, previously s.194J), or 10%?
    - Should we accept a payment as full settlement when the amount received is at least 98% of the invoice and the customer declares the TDS?
11. **Invoice timing.** For a due invoice (issued before payment, with a payment link), is the tax invoice issued on the invoice date or on the payment date? Which date does the time of supply follow?
    - *What the software does today (8 Oct, pending your answer):* the due bill is a bill or proforma with its own series (`FBB/2026-27/0001`) and no GST number. The GST tax invoice (`FB/2026-27/NNNN`) is issued on the **payment date**, when the money arrives. If you advise otherwise, this is one change in `modules/billing/settle.ts`.
12. **Invoice numbering.**
    - Can subscription invoices and wallet-recharge invoices share one series per financial year (for example `FB/2026-27/0001`)? Or should they use separate series?
    - Do we need a separate series per GSTIN if we register in another state later?
13. **Brand name.** Should "Flowbit" be added to our GST registration as a trade name before invoices go out under that brand?
14. **E-invoicing.** We understand IRN is not needed until our aggregate turnover passes ₹5 crore. Please confirm.

16. **Billing before we have a GSTIN (owner decision D8, 11 Oct 2026).**
    - *What the software does now:* while `FLOWBIT_GSTIN` is unset, Flowbit's own subscription bills, invoices and wallet recharges carry **no GST line** and no CGST/SGST/IGST. The document is titled "Invoice (not a tax invoice)" and says "Flowbit is not registered for GST yet, so no GST is charged." The bill series and numbering are unchanged. Once `FLOWBIT_GSTIN` is set, new documents are GST tax invoices with 18% GST again; documents already issued are not changed.
    - Please confirm: (a) is it correct not to charge or show GST at all until registration, and is this wording right for an unregistered supplier; (b) can the "not a tax invoice" invoices stay in the same `FB/2026-27/NNNN` series, or should they use a separate series; (c) at what turnover, or from which date, must we register (we sell online to businesses in other states, so we think registration may be compulsory from the first inter-state supply); (d) does TDS at 2% still apply to a bill with no GST, calculated on the full amount.

### D. Later

15. **Moving to a Pvt Ltd.** If we later move the business to a private limited company, what has to change?
    - Invoices, GSTIN, unused customer credits and autopay mandates.
    - Should the terms say now that the agreement can be assigned to an affiliate?

## Our proposed terms (please check the tax wording)

> **Message credits.** Credits can be used only for messages sent through Flowbit. They cannot be withdrawn as cash or transferred. Credits charged for a message that failed to send are returned to your balance. Paid credits expire 12 months after purchase. Bonus and free credits expire as stated with the offer. Unused paid credits are not refundable, except for duplicate payments or if we discontinue the service. In that case they are refunded to the original payment method against a credit note. Prices exclude 18% GST, which is charged on each recharge.
