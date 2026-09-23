import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const createPodImage = createAction({
    auth: nucleusAuth,
    name: 'create_pod_image',
    displayName: 'Upload POD Image',
    description: 'Attach a proof-of-delivery image or document to a waybill, from a file or a signed URL (createpodbase64).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        source: Property.StaticDropdown({
            displayName: 'Image Source',
            required: true,
            defaultValue: 'file',
            options: {
                options: [
                    { label: 'File', value: 'file' },
                    { label: 'Signed URL', value: 'signedUrl' },
                ],
            },
        }),
        file: Property.File({ displayName: 'File', description: 'Required when Image Source is File.', required: false }),
        signedUrl: Property.ShortText({ displayName: 'Signed URL', description: 'Required when Image Source is Signed URL.', required: false }),
        imageFormat: Property.StaticDropdown({
            displayName: 'Image Format',
            required: true,
            options: {
                options: [
                    { label: 'PDF', value: 'PDF' },
                    { label: 'TIFF', value: 'TIFF' },
                    { label: 'JPG', value: 'JPG' },
                    { label: 'PNG', value: 'PNG' },
                ],
            },
        }),
    },
    async run(context) {
        const p = context.propsValue;
        const auth = context.auth.props;
        const image = resolveImage({ source: p.source, fileBase64: p.file?.base64, signedUrl: p.signedUrl });
        return nucleusClient.call({
            auth,
            store: context.store,
            method: HttpMethod.POST,
            path: 'createpodbase64',
            body: { Waybill: p.waybill, Image: image.value, StringType: image.stringType, ImageFormat: p.imageFormat, GroupName: auth.groupName },
        });
    },
});

function resolveImage({ source, fileBase64, signedUrl }: { source: string; fileBase64: string | undefined; signedUrl: string | undefined }): {
    value: string;
    stringType: string;
} {
    if (source === 'signedUrl') {
        if (!signedUrl || signedUrl.trim() === '') {
            throw new Error('Signed URL is required when Image Source is Signed URL');
        }
        return { value: signedUrl.trim(), stringType: 'SignedURL' };
    }
    if (!fileBase64) {
        throw new Error('File is required when Image Source is File');
    }
    return { value: fileBase64, stringType: 'BASE64' };
}
