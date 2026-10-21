import { render } from '@testing-library/react';

import { ProviderBillingModal } from './provider-billing-modal';

// The modal subscribes to a Tauri event on mount. There is no Tauri runtime
// in jsdom, so replace the event bridge with a stub that records the call.
const listen = vi.hoisted(() => vi.fn(() => Promise.resolve(() => {})));
vi.mock('@tauri-apps/api/event', () => ({ listen }));

describe('ProviderBillingModal', () => {
  it('should render closed and subscribe to the billing event', () => {
    const { baseElement } = render(<ProviderBillingModal />);
    expect(baseElement).toBeTruthy();
    expect(listen).toHaveBeenCalled();
    // The modal is closed until Tauri sends the show event.
    expect(baseElement.querySelector('[role="dialog"]')).toBeNull();
  });
});
