import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [contact, medical, licenses, preferences, notifications, profile] = await Promise.all([
      prisma.userContact.findUnique({ where: { userId: user.id } }),
      prisma.pilotMedical.findUnique({ where: { userId: user.id } }),
      prisma.pilotLicense.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.userPreferences.findUnique({ where: { userId: user.id } }),
      prisma.userNotificationSettings.findUnique({ where: { userId: user.id } }),
      prisma.pilotProfile.findUnique({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({
      user,
      contact,
      medical,
      licenses,
      preferences,
      notifications,
      profile,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();

    const personalInfo = body.personalInfo || {};
    const homeAirport = body.homeAirport || {};
    const medical = body.medical || {};
    const licenses = Array.isArray(body.licenses) ? body.licenses : [];
    const notifications = body.notifications || {};
    const preferences = body.units || {};

    const fullName = `${personalInfo.firstName || ''} ${personalInfo.lastName || ''}`.trim();

    await prisma.user.update({
      where: { email: user.email },
      data: { name: fullName || null },
    });

    await prisma.userContact.upsert({
      where: { userId: user.id },
      update: {
        phone: personalInfo.phone || null,
        address1: personalInfo.address1 || null,
        address2: personalInfo.address2 || null,
        city: personalInfo.city || null,
        state: personalInfo.state || null,
        postalCode: personalInfo.postalCode || null,
        country: personalInfo.country || null,
      },
      create: {
        userId: user.id,
        phone: personalInfo.phone || null,
        address1: personalInfo.address1 || null,
        address2: personalInfo.address2 || null,
        city: personalInfo.city || null,
        state: personalInfo.state || null,
        postalCode: personalInfo.postalCode || null,
        country: personalInfo.country || null,
      },
    });

    await prisma.pilotProfile.upsert({
      where: { userId: user.id },
      update: {
        homeAirport: homeAirport.icao || null,
        homeAirportName: homeAirport.name || null,
        homeAirportFbo: homeAirport.fbo || null,
        homeAirportFuelType: homeAirport.fuelType || null,
      },
      create: {
        userId: user.id,
        homeAirport: homeAirport.icao || null,
        homeAirportName: homeAirport.name || null,
        homeAirportFbo: homeAirport.fbo || null,
        homeAirportFuelType: homeAirport.fuelType || null,
        ratings: '[]',
      },
    });

    // Get the pilot profile ID
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    await prisma.pilotMedical.upsert({
      where: { userId: user.id },
      update: {
        medicalClass: medical.class || null,
        certificateNumber: medical.certificateNumber || null,
        examinerName: medical.examinerName || null,
        issueDate: medical.issueDate ? new Date(medical.issueDate) : null,
        expirationDate: medical.expirationDate ? new Date(medical.expirationDate) : null,
      },
      create: {
        userId: user.id,
        medicalClass: medical.class || null,
        certificateNumber: medical.certificateNumber || null,
        examinerName: medical.examinerName || null,
        issueDate: medical.issueDate ? new Date(medical.issueDate) : null,
        expirationDate: medical.expirationDate ? new Date(medical.expirationDate) : null,
      },
    });

    await prisma.userNotificationSettings.upsert({
      where: { userId: user.id },
      update: {
        maintenanceAlerts: !!notifications.maintenanceAlerts,
        currencyReminders: !!notifications.currencyReminders,
        weatherAlerts: !!notifications.weatherAlerts,
        emailNotifications: !!notifications.emailNotifications,
        smsNotifications: !!notifications.smsNotifications,
        pushNotifications: !!notifications.pushNotifications,
      },
      create: {
        userId: user.id,
        maintenanceAlerts: !!notifications.maintenanceAlerts,
        currencyReminders: !!notifications.currencyReminders,
        weatherAlerts: !!notifications.weatherAlerts,
        emailNotifications: !!notifications.emailNotifications,
        smsNotifications: !!notifications.smsNotifications,
        pushNotifications: !!notifications.pushNotifications,
      },
    });

    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: {
        distanceUnit: preferences.distance || 'nautical',
        temperatureUnit: preferences.temperature || 'fahrenheit',
        timeFormat: preferences.timeFormat || '24h',
        dateFormat: preferences.dateFormat || 'MM/DD/YYYY',
      },
      create: {
        userId: user.id,
        distanceUnit: preferences.distance || 'nautical',
        temperatureUnit: preferences.temperature || 'fahrenheit',
        timeFormat: preferences.timeFormat || '24h',
        dateFormat: preferences.dateFormat || 'MM/DD/YYYY',
      },
    });

    await prisma.pilotLicense.deleteMany({ where: { pilotProfileId: pilotProfile?.id } });
    if (pilotProfile?.id) {
      for (const license of licenses) {
        await prisma.pilotLicense.create({
          data: {
            pilotProfileId: pilotProfile.id,
            type: license.type || 'License',
            number: license.number || null,
            issueDate: license.issueDate ? new Date(license.issueDate) : null,
            ratings: Array.isArray(license.ratings) ? JSON.stringify(license.ratings) : '[]',
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
