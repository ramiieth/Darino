// @vitest-environment jsdom
/**
 * PropertyMarketPage — اسموک تست رندر (بدون شبکه/دیتابیس)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PropertyMarketPage } from './PropertyMarketPage';
import { usePropertyMarketStore } from '../data/store';
import type { PropertyMarketListing } from '../domain/types';

function listing(token: string, nb: string, nbKey: string, ppm: number): PropertyMarketListing {
  return {
    token,
    url: '',
    city: 'ahvaz',
    cityId: '3',
    neighborhood: nb,
    neighborhoodKey: nbKey,
    propertyKind: 'apartment',
    areaSqm: 100,
    rooms: 2,
    yearBuilt: 1400,
    floor: 2,
    totalPriceToman: ppm * 100,
    pricePerSqmToman: ppm,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    title: null,
    listedAt: null,
    scrapedAt: 1,
    source: 'divar'
  };
}

describe('PropertyMarketPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    usePropertyMarketStore.setState({
      listings: [],
      snapshots: [],
      legacyAssets: [],
      scenario: { futureUsdRateToman: null, propertyTomanGrowthPct: null, updatedAt: 0 },
      loading: false,
      hydrated: true,
      remoteConnected: false,
      collect: {
        status: 'idle',
        message: null,
        chunks: 0,
        listingsAdded: 0,
        detailsFetched: 0,
        cursor: null,
        serverUnavailable: false
      }
    });
  });

  it('حالت خالی — پیام راهنما نمایش داده می‌شود', async () => {
    render(<PropertyMarketPage />);
    expect((await screen.findAllByText(/بازار املاک/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/کلکشنر دیوار/)).length).toBeGreaterThan(0);
  });

  it('با داده آگهی — جدول مناطق و کارت‌های دلاری رندر می‌شوند', async () => {
    usePropertyMarketStore.setState({
      listings: [
        listing('k1', 'کیانپارس', 'kianpars', 50_000_000),
        listing('g1', 'گلستان', 'golestan', 30_000_000)
      ]
    });
    render(<PropertyMarketPage />);
    expect((await screen.findAllByText('کیانپارس')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('گلستان')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/میانگین|میانه/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/نمودار ۳/)).length).toBe(1);
    expect((await screen.findAllByText(/نمودار ۴/)).length).toBe(1);
  });
});
