import sys
t = open(r'E:\Coding\Hal\frontend\src\app\(main)\video\page.tsx', encoding='utf-8').read()
print('Open {:', t.count('{'))
print('Close }:', t.count('}'))
print('Open (:', t.count('('))
print('Close ):', t.count(')'))
print('Open <:', t.count('<'))
print('Close >:', t.count('>'))
