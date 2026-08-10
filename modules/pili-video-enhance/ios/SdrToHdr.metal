// Copyright 2026 PiliPlus. All rights reserved.

#include <metal_stdlib>
using namespace metal;

struct SdrToHdrUniforms {
    float4 sourceRect;
    float2 outputSize;
    float headroom;
    float saturationBoost;
    uint matrixType;
    uint fullRange;
    uint transferFunction;
    uint sourceLayout;
    float2 padding;
};

static float3 decodeYcbcr(float y, float2 cbcr, uint matrixType, uint fullRange) {
    float normalizedY = y;
    float2 normalizedChroma = cbcr;
    if (fullRange == 0) {
        normalizedY = (y - 16.0 / 255.0) * 255.0 / 219.0;
        normalizedChroma = (cbcr - 128.0 / 255.0) * 255.0 / 224.0;
    } else {
        normalizedChroma = cbcr - 0.5;
    }

    if (matrixType == 0) {
        return float3(
            normalizedY + 1.402 * normalizedChroma.y,
            normalizedY - 0.344136 * normalizedChroma.x - 0.714136 * normalizedChroma.y,
            normalizedY + 1.772 * normalizedChroma.x
        );
    }
    if (matrixType == 2) {
        return float3(
            normalizedY + 1.4746 * normalizedChroma.y,
            normalizedY - 0.16455 * normalizedChroma.x - 0.57135 * normalizedChroma.y,
            normalizedY + 1.8814 * normalizedChroma.x
        );
    }
    return float3(
        normalizedY + 1.5748 * normalizedChroma.y,
        normalizedY - 0.1873 * normalizedChroma.x - 0.4681 * normalizedChroma.y,
        normalizedY + 1.8556 * normalizedChroma.x
    );
}

static float3 decodeTransfer(float3 value, uint transferFunction) {
    if (transferFunction == 1) {
        // TODO: 真机验证 HLG 逆 OETF 曲线。
        float3 a = max(value, 0.0);
        float3 low = a * a / 3.0;
        float3 high = (exp((a - 0.55991073) / 0.17883277) + 0.28466892) / 1.41421356;
        return select(low, high, a > 0.5);
    }
    if (transferFunction == 2) {
        const float m1 = 0.1593017578125;
        const float m2 = 78.84375;
        const float c1 = 0.8359375;
        const float c2 = 18.8515625;
        const float c3 = 18.6875;
        float3 p = pow(max(value, 0.0), 1.0 / m2);
        return pow(max(p - c1, 0.0) / (c2 - c3 * p), 1.0 / m1);
    }

    float3 a = abs(value);
    float3 low = a / 4.5;
    float3 high = pow((a + 0.099) / 1.099, 1.0 / 0.45);
    float3 linear = select(low, high, a > 0.081);
    return sign(value) * linear;
}

static float3 primariesToP3(float3 linearRgb, uint matrixType) {
    float3 xyz;
    if (matrixType == 2) {
        xyz = float3(
            dot(float3(0.6370, 0.1446, 0.1689), linearRgb),
            dot(float3(0.2627, 0.6780, 0.0593), linearRgb),
            dot(float3(0.0000, 0.0281, 1.0610), linearRgb)
        );
    } else {
        xyz = float3(
            dot(float3(0.4124564, 0.3575761, 0.1804375), linearRgb),
            dot(float3(0.2126729, 0.7151522, 0.0721750), linearRgb),
            dot(float3(0.0193339, 0.1191920, 0.9503041), linearRgb)
        );
    }
    return float3(
        dot(float3(2.4934969, -0.9313836, -0.4027108), xyz),
        dot(float3(-0.8294890, 1.7626641, 0.0236247), xyz),
        dot(float3(0.0358458, -0.0761724, 0.9568845), xyz)
    );
}

static float3 linearToOkLab(float3 linearRgb) {
    float l = 0.4122214708 * linearRgb.r + 0.5363325363 * linearRgb.g + 0.0514459929 * linearRgb.b;
    float m = 0.2119034982 * linearRgb.r + 0.6806995451 * linearRgb.g + 0.1073969566 * linearRgb.b;
    float s = 0.0883024619 * linearRgb.r + 0.2817188376 * linearRgb.g + 0.6299787005 * linearRgb.b;
    l = pow(max(l, 0.0), 1.0 / 3.0);
    m = pow(max(m, 0.0), 1.0 / 3.0);
    s = pow(max(s, 0.0), 1.0 / 3.0);
    return float3(
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    );
}

static float3 oklabToLinear(float3 lab) {
    float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
    l = l * l * l;
    m = m * m * m;
    s = s * s * s;
    return float3(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

kernel void sdrToHdrKernel(
    texture2d<float, access::sample> lumaTexture [[texture(0)]],
    texture2d<float, access::sample> chromaTexture [[texture(1)]],
    texture2d<float, access::write> outputTexture [[texture(2)]],
    texture3d<float, access::sample> lutTexture [[texture(3)]],
    constant SdrToHdrUniforms& uniforms [[buffer(0)]],
    uint2 gid [[thread_position_in_grid]]
) {
    constexpr sampler linearSampler(
        coord::normalized,
        address::clamp_to_edge,
        filter::linear
    );

    float2 outputPosition = (float2(gid) + 0.5) / max(uniforms.outputSize, float2(1.0, 1.0));
    float2 sourceUv = (outputPosition - uniforms.sourceRect.xy) / max(uniforms.sourceRect.zw, float2(1e-4, 1e-4));
    if (any(sourceUv < 0.0) || any(sourceUv > 1.0)) {
        outputTexture.write(float4(0.0, 0.0, 0.0, 1.0), gid);
        return;
    }

    float3 linearRgb;
    if (uniforms.sourceLayout == 1) {
        float4 bgra = lumaTexture.sample(linearSampler, sourceUv).bgra;
        linearRgb = decodeTransfer(float3(bgra.r, bgra.g, bgra.b), 0);
    } else {
        float y = lumaTexture.sample(linearSampler, sourceUv).r;
        float2 cbcr = chromaTexture.sample(linearSampler, sourceUv).rg;
        float3 encodedRgb = decodeYcbcr(y, cbcr, uniforms.matrixType, uniforms.fullRange);
        linearRgb = decodeTransfer(encodedRgb, uniforms.transferFunction);
    }

    linearRgb = primariesToP3(max(linearRgb, 0.0), uniforms.matrixType);

    float3 lab = linearToOkLab(linearRgb);
    float highlightDesaturation = 1.0 - smoothstep(0.7, 1.2, lab.x) * 0.35;
    float chromaScale = 1.0 + (uniforms.saturationBoost - 1.0) * highlightDesaturation;
    lab.yz *= chromaScale;
    linearRgb = oklabToLinear(lab);

    float3 lutCoordinate = clamp(linearRgb / 4.0, 0.0, 1.0);
    float3 expanded = lutTexture.sample(linearSampler, lutCoordinate).rgb;
    outputTexture.write(float4(expanded, 1.0), gid);
}
