import {
  discoverDevicesAsync,
  soapActionAsync,
  stopDiscoveryAsync,
} from 'pili-dlna';

export interface DlnaDevice {
  key: string;
  friendlyName: string;
  location: string;
  controlUrl: string;
}

export async function discoverDlnaDevices(timeoutMs = 8000): Promise<DlnaDevice[]> {
  return await discoverDevicesAsync(timeoutMs);
}

export async function stopDlnaDiscovery(): Promise<void> {
  await stopDiscoveryAsync();
}

async function soapAction(
  device: DlnaDevice,
  action: string,
  args: Record<string, string>,
): Promise<void> {
  const ok = await soapActionAsync(device.controlUrl, action, args);
  if (!ok) throw new Error(`DLNA ${action} failed`);
}

export async function dlnaSetUrl(device: DlnaDevice, url: string, title = ''): Promise<void> {
  const meta = title
    ? `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><dc:title>${title}</dc:title></item></DIDL-Lite>`
    : '';
  await soapAction(
    device,
    'SetAVTransportURI',
    {
      InstanceID: '0',
      CurrentURI: url,
      CurrentURIMetaData: meta,
    },
  );
}

export async function dlnaPlay(device: DlnaDevice): Promise<void> {
  await soapAction(device, 'Play', { InstanceID: '0', Speed: '1' });
}

export async function dlnaPause(device: DlnaDevice): Promise<void> {
  await soapAction(device, 'Pause', { InstanceID: '0' });
}

export async function dlnaStop(device: DlnaDevice): Promise<void> {
  await soapAction(device, 'Stop', { InstanceID: '0' });
}
