export const cameraMock: {
  permission: { granted: boolean } | null;
  requestPermission: jest.Mock;
  takePictureAsync: jest.Mock;
} = {
  permission: null,
  requestPermission: jest.fn(async () => ({ granted: true })),
  takePictureAsync: jest.fn(async () => ({ uri: 'file://shelf.jpg', base64: '/9jphoto' })),
};
