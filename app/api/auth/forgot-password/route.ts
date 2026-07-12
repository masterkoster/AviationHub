import { prisma } from "@/lib/auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

// POST /api/auth/forgot-password
// Sends a password reset email to the user
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      // Don't reveal whether user exists or not for security
      return NextResponse.json({ 
        success: true, 
        message: "If an account exists, a reset link has been sent" 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to database
    await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    // Send actual password reset email
    const emailResult = await sendPasswordResetEmail(
      normalizedEmail,
      resetToken,
      user.username || user.name || "there"
    );

    if (!emailResult.success) {
      console.error("Failed to send password reset email:", emailResult.error);
      // Still return success to not reveal system errors
    }

    // For development/debugging - log the URL
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/desktop/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;
    console.log("Password reset link:", resetUrl);

    return NextResponse.json({ 
      success: true, 
      message: "If an account exists, a reset link has been sent"
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
