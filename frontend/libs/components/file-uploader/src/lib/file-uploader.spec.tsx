import { render, screen } from '@testing-library/react';

import { FileUploader } from './file-uploader';

describe('FileUploader', () => {
  it('should render the empty drop zone with the supported types', () => {
    render(
      <FileUploader files={[]} fileTypes={['PNG', 'JPG']} handleChange={() => {}} />,
    );
    expect(screen.getByText(/drop it here/i)).toBeTruthy();
    expect(screen.getByText(/PNG, JPG supported/i)).toBeTruthy();
  });
});
