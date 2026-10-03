// @vitest-environment node
import {it,expect} from 'vitest';
import {zerionBudget} from '../../api/_zerionPolicy';
it('backs off based on the lowest remaining day/month ratio and never invents missing counts',()=>{expect(zerionBudget(new Headers()).dayRemaining).toBeNull();expect(zerionBudget(new Headers()).walletMs).toBe(1800000);expect(zerionBudget(new Headers({'RateLimit-Org-Day-Limit':'100','RateLimit-Org-Day-Remaining':'10'})).walletMs).toBe(3600000);expect(zerionBudget(new Headers({'RateLimit-Org-Day-Limit':'100','RateLimit-Org-Day-Remaining':'90','RateLimit-Org-Month-Limit':'1000','RateLimit-Org-Month-Remaining':'20'})).walletMs).toBe(14400000);});
