/**
 * Weight & Balance Calculator API
 * Calculate W&B and get aircraft specifications
 */

import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'aviation_hub.db');

// Standard passenger weights (including 10 lb allowance for clothing/baggage)
const DEFAULT_PASSENGER_WEIGHT = 170; // lbs

export async function GET(): Promise<NextResponse> {
  const db = new sqlite3.Database(DB_PATH);
  
  return new Promise<NextResponse>((resolve) => {
    db.all("SELECT make, model, empty_weight, empty_cg, max_weight, fuel_capacity, cruise_speed, fuel_burn FROM weight_balance ORDER BY make, model", [], (err, rows: any[]) => {
      db.close();
      
      if (err) {
        console.error('Error:', err);
        return resolve(NextResponse.json({ error: 'Database error' }, { status: 500 }));
      }

      resolve(NextResponse.json({ aircraft: rows }));
    });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { 
      aircraftId,
      make,
      model,
      pilotWeight = DEFAULT_PASSENGER_WEIGHT,
      passengers = 0,
      passengerWeight = DEFAULT_PASSENGER_WEIGHT,
      baggageWeight = 0,
      fuelGallons = 0
    } = await request.json();

    if (!make && !model && !aircraftId) {
      return NextResponse.json({ error: 'Aircraft required' }, { status: 400 });
    }

    const db = new sqlite3.Database(DB_PATH);
    
    // Get aircraft specs
    const getAircraft = () => new Promise<any>((resolve, reject) => {
      if (aircraftId) {
        db.get("SELECT * FROM weight_balance WHERE id = ?", [aircraftId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      } else {
        db.get("SELECT * FROM weight_balance WHERE make = ? AND model = ?", [make, model], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }
    });

    const aircraft = await getAircraft();
    
    if (!aircraft) {
      db.close();
      return NextResponse.json({ error: 'Aircraft not found in database' }, { status: 404 });
    }

    // Weight & Balance Calculations
    const emptyWeight = aircraft.empty_weight;
    const emptyCG = aircraft.empty_cg;
    const maxWeight = aircraft.max_weight;
    const armPilot = aircraft.arm_pilot;
    const armPassenger = aircraft.arm_passenger;
    const armBaggage = aircraft.arm_baggage;
    const armFuel = aircraft.arm_fuel;
    const unusableFuel = aircraft.unusable_fuel || 2;
    const fuelDensity = 6.0; // lbs per gallon for 100LL

    // Split weights and moments — previously passengerLoad + baggageLoad
    // were erroneously summed into totalWeight as moments (see bug at this
    // line). Now weights and moments are computed separately so totalWeight
    // is the true weight and totalMoment is the true moment·inches.
    const pilotWeightActual = pilotWeight;
    const passengerWeightTotal = passengers * passengerWeight;
    const baggageWeightTotal = baggageWeight;
    const fuelWeightTotal = fuelGallons * fuelDensity;

    // Total weight (true sum of weights, not moments)
    const totalWeight =
      emptyWeight +
      pilotWeightActual +
      passengerWeightTotal +
      baggageWeightTotal +
      fuelWeightTotal;

    // Total moment (sum of weight × arm per station)
    const totalMoment =
      emptyWeight * emptyCG +
      pilotWeightActual * armPilot +
      passengerWeightTotal * armPassenger +
      baggageWeightTotal * armBaggage +
      fuelWeightTotal * armFuel;

    // Calculate CG
    const cg = totalWeight > 0 ? totalMoment / totalWeight : emptyCG;

    // Check if within limits
    const cgMin = aircraft.cg_min || 78;
    const cgMax = aircraft.cg_max || 93;
    const isWithinCG = cg >= cgMin && cg <= cgMax;
    const isWithinWeight = totalWeight <= maxWeight;

    // Calculate fuel penalty if overweight
    let fuelPenalty = 0;
    let fuelPenaltyMessage = '';
    
    if (totalWeight > maxWeight) {
      const overweightLbs = totalWeight - maxWeight;
      fuelPenalty = Math.ceil(overweightLbs / fuelDensity);
      fuelPenaltyMessage = `Reduce fuel by ${fuelPenalty} gallons to be within weight limits`;
    }

    // Calculate range with current fuel (reserve-adjusted)
    const usableFuel = Math.max(0, fuelGallons - unusableFuel);
    const cruiseSpeed = aircraft.cruise_speed;
    const fuelBurn = aircraft.fuel_burn;
    
    // Range with reserves (1 hour reserve)
    const reserveFuel = fuelBurn * 1;
    const effectiveRange = usableFuel > reserveFuel 
      ? ((usableFuel - reserveFuel) / fuelBurn) * cruiseSpeed 
      : 0;

    // Range without reserve
    const maxRange = usableFuel > 0 
      ? (usableFuel / fuelBurn) * cruiseSpeed 
      : 0;

    db.close();

    return NextResponse.json({
      aircraft: {
        make: aircraft.make,
        model: aircraft.model,
        emptyWeight,
        emptyCG,
        maxWeight,
        cruiseSpeed,
        fuelBurn
      },
      input: {
        pilotWeight,
        passengers,
        passengerWeight,
        baggageWeight,
        fuelGallons,
        actualPassengers: (passengerWeight > 0 ? passengers : 0) + (pilotWeight > 0 ? 1 : 0)
      },
      calculations: {
        totalWeight: Math.round(totalWeight),
        cg: Math.round(cg * 100) / 100,
        maxWeight,
        isWithinWeight,
        isWithinCG,
        cgMin,
        cgMax,
        overweightLbs: Math.max(0, totalWeight - maxWeight)
      },
      fuelPenalty: {
        gallons: fuelPenalty,
        message: fuelPenaltyMessage
      },
      range: {
        withReserve: Math.round(effectiveRange),
        max: Math.round(maxRange),
        reserveFuel: Math.round(reserveFuel),
        usableFuel: Math.round(usableFuel)
      },
      warning: !isWithinWeight || !isWithinCG 
        ? `⚠️ ${!isWithinWeight ? 'Overweight' : ''} ${!isWithinCG ? 'CG out of limits' : ''}`.trim()
        : null,
      disclaimer: '⚠️ These are TYPICAL VALUES - verify with actual aircraft documents before flight'
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Calculation error' }, { status: 500 });
  }
}
