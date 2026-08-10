require 'json'

Pod::Spec.new do |s|
  s.name           = 'PiliVideoEnhance'
  s.version        = '0.1.0'
  s.summary        = 'PiliPlus native video enhancement for iOS'
  s.description    = 'Super resolution, frame interpolation and SDR to HDR rendering for the shared native AVPlayer.'
  s.homepage       = 'https://example.com/piliplus'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'PiliPlus'
  s.source         = { :git => 'https://example.com/piliplus.git', :tag => s.version.to_s }
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.resource_bundles = { 'PiliVideoEnhance' => ['**/*.{metal}'] }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
end
