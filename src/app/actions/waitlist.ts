// Mock client-side implementation of waitlist action for Tauri PoC (removes Next.js "use server")
export async function joinWaitlist(formData: FormData) {
    const email = formData.get('email')?.toString().trim();
    if (!email) {
        return { success: false, error: 'An email address is required.' };
    }
    console.log('[Tauri PoC] Waitlist submission received:', email);
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { success: true };
}
