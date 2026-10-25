/** فانکشن گروهی «سرویس‌ها» — /api/integrations ، /api/borosAccount (نقشه: _routes.ts) */
import { groupHandler } from './_dispatch.js';

// وب‌هوک Zerion امضای بدنهٔ خام را می‌سنجد؛ باید در خود فایل فانکشن تعریف شود.
export const config = { api: { bodyParser: false } };

export default groupHandler<'services'>({
  integrations: () => import('./_integrationsRoute.js'),
  borosAccount: () => import('./_borosAccountRoute.js')
});
