/**
 * Builds the actual delivery list for a campaign.
 *
 * Phone numbers and email addresses are deduplicated independently. That preserves two
 * distinct phone numbers that happen to share an email address, while ensuring the
 * shared inbox receives only one email.
 */
export function campaignDeliveryDestinations(contacts, channel) {
    const uniquePhones = new Set();
    const uniqueEmails = new Set();
    for (const contact of contacts) {
        const phone = contact.phone?.trim();
        const email = contact.email?.trim().toLowerCase();
        if (phone)
            uniquePhones.add(phone);
        if (email)
            uniqueEmails.add(email);
    }
    const phones = channel === "EMAIL" ? [] : [...uniquePhones];
    const emails = channel === "SMS" ? [] : [...uniqueEmails];
    return {
        phones,
        emails,
        smsRecipientCount: phones.length,
        emailRecipientCount: emails.length,
        // Success and failure are recorded per delivery, so the planned total must use the
        // same unit. A combined campaign plans one delivery per channel destination.
        recipientCount: phones.length + emails.length
    };
}
