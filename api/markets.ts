/** فانکشن گروهی «بازار» — /api/cg ، /api/usdt ، /api/boros ، /api/propertyMarket ، /api/traders ، /api/intel (نقشه: _routes.ts) */
import { groupHandler } from './_dispatch.js';

export default groupHandler<'markets'>({
  cg: () => import('./_cgRoute.js'),
  usdt: () => import('./_usdtRoute.js'),
  boros: () => import('./_borosRoute.js'),
  propertyMarket: () => import('./_propertyMarketRoute.js'),
  traders: () => import('./_tradersRoute.js'),
  intel: () => import('./_intelRoute.js')
});
