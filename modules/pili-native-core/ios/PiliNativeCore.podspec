require 'json'

Pod::Spec.new do |s|
  s.name           = 'PiliNativeCore'
  s.version        = '0.1.0'
  s.summary        = 'PiliPlus native iOS core services'
  s.description    = 'Bilibili signing, URLSession network, cookie storage, BGAppRefreshTask and native image viewer.'
  s.homepage       = 'https://github.com/PiliPlus/PiliPlus'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'PiliPlus'
  s.source         = { :git => 'https://github.com/PiliPlus/PiliPlus.git', :tag => s.version.to_s }
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'SDWebImage', '~> 5.21.0'
end
