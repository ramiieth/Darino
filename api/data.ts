/** فانکشن گروهی «داده» — /api/auth ، /api/accounting ، /api/portfolio ، /api/dashboard ، /api/custody ، /api/health (نقشه: _routes.ts) */
import { groupHandler } from './_dispatch.js';

export default groupHandler<'data'>({
  auth: () => import('./_authRoute.js'),
  accounting: () => import('./_accountingRoute.js'),
  portfolio: () => import('./_portfolioRoute.js'),
  dashboard: () => import('./_dashboardRoute.js'),
  custody: () => import('./_custodyRoute.js'),
  health: () => import('./_healthRoute.js')
});
