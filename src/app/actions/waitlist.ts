'use server';

import { Resend } from 'resend';

// Initialize the Resend client using the environment variable.
// In a production environment, missing keys will gracefully fail rather than using dummy strings.
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

export async function joinWaitlist(formData: FormData) {
    // Extract and sanitize input data
    const email = formData.get('email')?.toString().trim();
    const comment = formData.get('comment')?.toString().trim();

    // 1. Input Validation
    if (!email) {
        return { success: false, error: 'An email address is required.' };
    }

    // Basic regex to ensure the email format is structurally valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { success: false, error: 'Please provide a valid email format.' };
    }

    try {
        // 2. Save Contact to Resend (if an Audience ID is configured)
        const audienceId = process.env.RESEND_AUDIENCE_ID;

        if (process.env.RESEND_API_KEY) {
            await resend.contacts.create({
                email: email,
                // Conditionally add audienceId only if the environment variable is configured
                ...(audienceId && { audienceId }),
                unsubscribed: false,
            });
        }

        // 3. Send Notification Email
        // If there's an API key, send the email
        if (process.env.RESEND_API_KEY) {
            await resend.emails.send({
                from: 'Waitlist <onboarding@resend.dev>', // Note: Update to your verified domain for production
                to: 'zhonghe.zhang@hotmail.com',
                subject: 'New Waitlist Submission for Henry\'s Meeting 🎉',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>New Waitlist Submission 🎉</h2>
                        <p>You have a new sign-up on your landing page for Henry's Meeting.</p>
                        <p><strong>Email:</strong> ${email}</p>
                        ${comment ? `
                        <p><strong>Comment:</strong></p>
                        <blockquote style="border-left: 4px solid #eaeaea; padding-left: 16px; color: #555;">
                            ${comment}
                        </blockquote>
                        ` : ''}
                    </div>
                `
            });
        } else {
            console.log('[Dev Mode] Waitlist submission received:', { email, comment });
        }

        return { success: true };

    } catch (error) {
        // Log the actual error to your Vercel server logs for debugging
        console.error('[Waitlist Action Error]:', error);

        // Return a sanitized error message to the client to prevent leaking sensitive infrastructure details
        return {
            success: false,
            error: 'An unexpected error occurred while submitting your request. Please try again.'
        };
    }
}
