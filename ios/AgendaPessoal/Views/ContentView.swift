import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            // Background to avoid any seams
            Color(red: 18/255.0, green: 20/255.0, blue: 19/255.0)
                .ignoresSafeArea()
            
            WebViewContainer()
                .ignoresSafeArea()
        }
    }
}

#Preview {
    ContentView()
}
