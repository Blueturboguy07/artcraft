import { render, screen } from '@testing-library/react';

import { Modal } from './modal';

describe('Modal', () => {
  it('should render its title and children when open', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test title">
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByText('Test title')).toBeTruthy();
    expect(screen.getByText('Modal body')).toBeTruthy();
  });

  it('should not render its children when closed', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden title">
        <p>Hidden body</p>
      </Modal>,
    );
    expect(screen.queryByText('Hidden body')).toBeNull();
  });
});
